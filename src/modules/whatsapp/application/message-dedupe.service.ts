import { Injectable } from '@nestjs/common';

/**
 * Bounded, in-memory guard against re-processing the same inbound message.
 * Baileys can redeliver events (e.g. after a reconnect); the DB unique
 * constraint on wa_message_id is the durable backstop for transactions, this
 * is a cheap first line of defence at the gateway.
 */
@Injectable()
export class MessageDedupeService {
  private readonly seen = new Set<string>();
  private readonly order: string[] = [];
  private readonly maxEntries = 2000;

  /** Returns true if the id was already seen; otherwise records and returns false. */
  isDuplicate(messageId: string): boolean {
    if (!messageId) return false;
    if (this.seen.has(messageId)) return true;

    this.seen.add(messageId);
    this.order.push(messageId);
    if (this.order.length > this.maxEntries) {
      const evicted = this.order.shift();
      if (evicted) this.seen.delete(evicted);
    }
    return false;
  }
}
