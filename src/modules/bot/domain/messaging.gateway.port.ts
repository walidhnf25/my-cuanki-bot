/** A normalized inbound message, decoupled from the chat platform's wire format. */
export interface IncomingMessage {
  /** Provider message id, unique across chats — used for idempotency. */
  messageId: string;
  /** Stable sender identifier (Telegram user id). Used as the user key. */
  from: string;
  /** Chat id to reply to. */
  chatId: string;
  /** Plain text body. */
  text: string;
  /** Sender's display name, if available. */
  senderName?: string;
  timestamp: Date;
}

export type IncomingMessageHandler = (message: IncomingMessage) => Promise<void>;

/**
 * Port abstracting the chat transport. The abstract class doubles as the DI
 * token so the handlers never depend on Telegram directly — another platform
 * adapter could replace it without touching them.
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
}
