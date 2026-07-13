import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type ConnectionState,
  type WAMessage,
  type WAMessageContent,
  type WASocket,
} from 'baileys';
import pino from 'pino';
import * as qrcode from 'qrcode-terminal';
import {
  ConnectionStatus,
  IncomingMessage,
  IncomingMessageHandler,
  MessagingGateway,
} from '../domain/messaging.gateway.port';

const MAX_RECONNECT_DELAY_MS = 30_000;

/** Read the HTTP-like status code Baileys attaches to disconnect errors (Boom). */
function disconnectStatusCode(error: unknown): number | undefined {
  const e = error as { output?: { statusCode?: number } } | undefined;
  return e?.output?.statusCode;
}

/** Extract plain text from the many WhatsApp message shapes. */
function extractText(message: WAMessageContent | null | undefined): string {
  if (!message) return '';
  return (
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.imageMessage?.caption ??
    message.videoMessage?.caption ??
    ''
  );
}

@Injectable()
export class BaileysGateway extends MessagingGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BaileysGateway.name);
  private readonly sessionPath: string;
  private readonly autostart: boolean;

  private sock: WASocket | null = null;
  private status: ConnectionStatus = 'disconnected';
  private handler: IncomingMessageHandler | null = null;
  private reconnectAttempts = 0;
  private connecting = false;
  private stopped = false;
  /** Cached WA Web protocol version (avoids 405 from an outdated default). */
  private waVersion: [number, number, number] | undefined;
  /** Bot's own phone number (for detecting the "message yourself" chat). */
  private ownNumber: string | null = null;
  /** Ids of messages we sent — so our own replies aren't reprocessed (loop guard). */
  private readonly sentIds = new Set<string>();
  private readonly sentOrder: string[] = [];

  constructor(private readonly config: ConfigService) {
    super();
    this.sessionPath = this.config.get<string>('whatsapp.sessionPath', './storage/wa-session');
    this.autostart = this.config.get<boolean>('whatsapp.autostart', true);
  }

  async onModuleInit(): Promise<void> {
    if (!this.autostart) {
      this.logger.warn('WA_AUTOSTART=false — WhatsApp connection not started');
      return;
    }
    await this.connect();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    try {
      this.sock?.end(undefined);
    } catch {
      // ignore shutdown errors
    }
  }

  onMessage(handler: IncomingMessageHandler): void {
    this.handler = handler;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  isConnected(): boolean {
    return this.status === 'connected';
  }

  async sendText(to: string, text: string): Promise<void> {
    const sent = await this.assertSocket().sendMessage(this.toJid(to), { text });
    if (sent?.key?.id) this.markSent(sent.key.id);
  }

  async sendDocument(
    to: string,
    content: Buffer,
    filename: string,
    mimetype = 'application/octet-stream',
  ): Promise<void> {
    const sent = await this.assertSocket().sendMessage(this.toJid(to), {
      document: content,
      fileName: filename,
      mimetype,
    });
    if (sent?.key?.id) this.markSent(sent.key.id);
  }

  // ---- Internal ----

  private async connect(): Promise<void> {
    if (this.connecting) return;
    this.connecting = true;
    this.status = 'connecting';

    const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);

    // Fetch the current WA Web version once — using an outdated default causes
    // WhatsApp to reject the connection with "405 Connection Failure".
    if (!this.waVersion) {
      try {
        const { version, isLatest } = await fetchLatestBaileysVersion();
        this.waVersion = version;
        this.logger.log(`Using WhatsApp Web version ${version.join('.')} (latest=${isLatest})`);
      } catch (err) {
        this.logger.warn({ err }, 'Could not fetch latest WA version; using bundled default');
      }
    }

    this.sock = makeWASocket({
      version: this.waVersion,
      auth: state,
      // We render the QR ourselves via connection.update.
      printQRInTerminal: false,
      logger: pino({ level: 'error' }),
      browser: ['finance-whatsapp-bot', 'Chrome', '1.0.0'],
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });

    this.sock.ev.on('creds.update', () => void saveCreds());
    this.sock.ev.on('connection.update', (u) => this.handleConnectionUpdate(u));
    this.sock.ev.on('messages.upsert', (u) => {
      void this.handleMessagesUpsert(u.messages, u.type);
    });

    this.connecting = false;
  }

  private handleConnectionUpdate(update: Partial<ConnectionState>): void {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      this.status = 'qr';
      this.logger.warn('Scan the QR code below with WhatsApp (Linked Devices):');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'connecting') {
      this.status = 'connecting';
    } else if (connection === 'open') {
      this.status = 'connected';
      this.reconnectAttempts = 0;
      this.ownNumber = this.sock?.user?.id ? this.jidToNumber(this.sock.user.id) : null;
      this.logger.log(`WhatsApp connection established ✅ (self=${this.ownNumber ?? 'unknown'})`);
    } else if (connection === 'close') {
      this.status = 'disconnected';
      const code = disconnectStatusCode(lastDisconnect?.error);
      if (code === DisconnectReason.loggedOut) {
        this.logger.error(
          `Logged out from WhatsApp. Delete the session folder (${this.sessionPath}) and re-scan the QR.`,
        );
        return;
      }
      if (!this.stopped) this.scheduleReconnect(code);
    }
  }

  private scheduleReconnect(code?: number): void {
    this.reconnectAttempts += 1;
    const delay = Math.min(2 ** this.reconnectAttempts * 1000, MAX_RECONNECT_DELAY_MS);
    this.logger.warn(
      `Reconnecting to WhatsApp in ${delay / 1000}s (attempt ${this.reconnectAttempts}, code=${code ?? 'n/a'})`,
    );
    setTimeout(() => {
      void this.connect().catch((err: unknown) =>
        this.logger.error({ err }, 'Reconnect attempt failed'),
      );
    }, delay);
  }

  private async handleMessagesUpsert(messages: WAMessage[], type: string): Promise<void> {
    // Trace inbound envelopes (debug level — enable with LOG_LEVEL=debug).
    this.logger.debug(
      {
        type,
        count: messages.length,
        keys: messages.map((m) => ({
          jid: m.key.remoteJid,
          fromMe: m.key.fromMe,
          hasMsg: !!m.message,
        })),
      },
      'messages.upsert received',
    );

    if (type !== 'notify' || !this.handler) return;

    for (const m of messages) {
      const jid = m.key.remoteJid;
      if (!m.message || !jid) continue;
      // Only direct 1:1 user chats — skip groups, status and channels. Accept
      // both classic (@s.whatsapp.net) and the newer privacy (@lid) addressing.
      if (jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.endsWith('@newsletter')) {
        continue;
      }
      if (!jid.endsWith('@s.whatsapp.net') && !jid.endsWith('@lid')) continue;

      const fromNumber = this.jidToNumber(jid);
      const isSelfChat = this.ownNumber !== null && fromNumber === this.ownNumber;
      // Skip our own outgoing messages to OTHER people, but allow the
      // "message yourself" chat so the owner can log by texting themselves.
      if (m.key.fromMe && !isSelfChat) continue;
      // Skip messages we sent ourselves (our replies echoed back) — loop guard.
      if (m.key.id && this.sentIds.has(m.key.id)) continue;

      const text = extractText(m.message).trim();
      if (!text) continue;

      const incoming: IncomingMessage = {
        waMessageId: m.key.id ?? '',
        from: fromNumber,
        chatJid: jid,
        text,
        pushName: m.pushName ?? undefined,
        timestamp: new Date(Number(m.messageTimestamp ?? 0) * 1000),
      };

      try {
        await this.handler(incoming);
      } catch (err) {
        this.logger.error({ err, from: incoming.from }, 'Failed to handle inbound message');
      }
    }
  }

  private assertSocket(): WASocket {
    if (!this.sock) {
      throw new Error('WhatsApp socket is not initialized');
    }
    return this.sock;
  }

  private toJid(phone: string): string {
    return phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
  }

  private jidToNumber(jid: string): string {
    return jid.split('@')[0].split(':')[0];
  }

  /** Remember an id we sent (bounded) so it isn't reprocessed as inbound. */
  private markSent(id: string): void {
    this.sentIds.add(id);
    this.sentOrder.push(id);
    if (this.sentOrder.length > 500) {
      const evicted = this.sentOrder.shift();
      if (evicted) this.sentIds.delete(evicted);
    }
  }
}
