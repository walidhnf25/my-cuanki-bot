import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IncomingMessageHandler, MessagingGateway } from '../domain/messaging.gateway.port';
import { toIncomingMessage } from './telegram-update.mapper';
import { TelegramUpdate } from './telegram.types';

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export class TelegramApiError extends Error {
  constructor(
    readonly method: string,
    readonly errorCode: number | undefined,
    description: string | undefined,
  ) {
    super(`Telegram ${method} failed (${errorCode ?? 'n/a'}): ${description ?? 'unknown error'}`);
  }
}

/**
 * Telegram Bot API adapter. Stateless: inbound updates are pushed in by the
 * webhook controller (or the dev poller) via {@link handleUpdate}, so it works
 * on serverless where nothing stays connected between requests.
 */
@Injectable()
export class TelegramGateway extends MessagingGateway {
  private readonly logger = new Logger(TelegramGateway.name);
  private readonly apiBase: string;
  private readonly allowedUserIds: Set<string>;
  private handler: IncomingMessageHandler | null = null;

  constructor(config: ConfigService) {
    super();
    this.apiBase = `https://api.telegram.org/bot${config.getOrThrow<string>('telegram.botToken')}`;
    this.allowedUserIds = new Set(config.get<string[]>('telegram.allowedUserIds', []));
  }

  onMessage(handler: IncomingMessageHandler): void {
    this.handler = handler;
  }

  /** Normalize an update and run the inbound handler on it (awaited). */
  async handleUpdate(update: TelegramUpdate): Promise<void> {
    const message = toIncomingMessage(update);
    if (!message || !this.handler) return;

    if (this.allowedUserIds.size > 0 && !this.allowedUserIds.has(message.from)) {
      this.logger.warn(
        { from: message.from },
        'Message from a user not in TELEGRAM_ALLOWED_USER_IDS',
      );
      return;
    }

    await this.handler(message);
  }

  /**
   * Replies use Telegram's legacy Markdown (`*bold*`, `_italic_`), which matches
   * the reply templates. Text echoed from the user can contain unbalanced `*`
   * or `_`, so a parse failure falls back to sending the message as plain text.
   */
  async sendText(to: string, text: string): Promise<void> {
    try {
      await this.call('sendMessage', { chat_id: to, text, parse_mode: 'Markdown' });
    } catch (err) {
      if (err instanceof TelegramApiError && err.errorCode === 400) {
        await this.call('sendMessage', { chat_id: to, text });
        return;
      }
      throw err;
    }
  }

  async sendDocument(
    to: string,
    content: Buffer,
    filename: string,
    mimetype = 'application/octet-stream',
  ): Promise<void> {
    const form = new FormData();
    form.append('chat_id', to);
    form.append('document', new Blob([new Uint8Array(content)], { type: mimetype }), filename);
    await this.send('sendDocument', { method: 'POST', body: form });
  }

  /** Long-poll for updates (development only — conflicts with an active webhook). */
  getUpdates(offset: number, timeoutSeconds: number): Promise<TelegramUpdate[]> {
    return this.call('getUpdates', {
      offset,
      timeout: timeoutSeconds,
      allowed_updates: ['message'],
    });
  }

  private call<T>(method: string, body: Record<string, unknown>): Promise<T> {
    return this.send<T>(method, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async send<T>(method: string, init: RequestInit): Promise<T> {
    const res = await fetch(`${this.apiBase}/${method}`, init);
    const body = (await res.json()) as TelegramResponse<T>;
    if (!body.ok) throw new TelegramApiError(method, body.error_code, body.description);
    return body.result as T;
  }
}
