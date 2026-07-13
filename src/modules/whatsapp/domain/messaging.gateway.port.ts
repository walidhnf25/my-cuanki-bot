/** A normalized inbound message, decoupled from Baileys' wire format. */
export interface IncomingMessage {
  /** Provider message id — used for idempotency. */
  waMessageId: string;
  /** Stable sender identifier (phone digits or LID number). Used as the user key. */
  from: string;
  /** Full chat JID to reply to (e.g. `62...@s.whatsapp.net` or `...@lid`). */
  chatJid: string;
  /** Plain text body. */
  text: string;
  /** WhatsApp display name, if available. */
  pushName?: string;
  timestamp: Date;
}

export type IncomingMessageHandler = (message: IncomingMessage) => Promise<void>;

export type ConnectionStatus = 'disconnected' | 'connecting' | 'qr' | 'connected';

/**
 * Port abstracting the WhatsApp transport. The abstract class doubles as the DI
 * token so the domain never depends on Baileys directly — a WhatsApp Cloud API
 * adapter could replace it without touching handlers.
 */
export abstract class MessagingGateway {
  /** Register the inbound message handler (called once at startup). */
  abstract onMessage(handler: IncomingMessageHandler): void;

  abstract sendText(to: string, text: string): Promise<void>;

  abstract sendDocument(
    to: string,
    content: Buffer,
    filename: string,
    mimetype?: string,
  ): Promise<void>;

  abstract getStatus(): ConnectionStatus;

  abstract isConnected(): boolean;
}
