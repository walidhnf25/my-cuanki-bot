import { Injectable } from '@nestjs/common';
import { ConversationState } from 'src/shared/domain/enums';
import { ConversationContextEntity } from '../domain/conversation-context.entity';
import { ConversationRepository } from '../domain/conversation.repository';
import { PendingTransaction } from '../domain/pending-transaction';

/** How long a pending clarification stays valid before it expires. */
export const CONTEXT_TTL_MS = 5 * 60 * 1000;

/**
 * Domain-facing wrapper around the conversation context repository. Encapsulates
 * TTL handling and the small set of states the bot uses for multi-turn flows.
 */
@Injectable()
export class ConversationService {
  constructor(private readonly repository: ConversationRepository) {}

  /** Active (non-expired, non-IDLE) context, or null. */
  getActive(userId: string, now: Date): Promise<ConversationContextEntity | null> {
    return this.repository.getActive(userId, now);
  }

  /** Remember a transaction that is missing its amount and wait for the reply. */
  async awaitAmount(userId: string, pending: PendingTransaction, now: Date): Promise<void> {
    await this.repository.set({
      userId,
      state: ConversationState.AWAITING_AMOUNT,
      payload: pending as unknown as Record<string, unknown>,
      expiresAt: new Date(now.getTime() + CONTEXT_TTL_MS),
    });
  }

  /** Remember a complete transaction that still needs a wallet and wait for the reply. */
  async awaitWallet(userId: string, pending: PendingTransaction, now: Date): Promise<void> {
    await this.repository.set({
      userId,
      state: ConversationState.AWAITING_WALLET,
      payload: pending as unknown as Record<string, unknown>,
      expiresAt: new Date(now.getTime() + CONTEXT_TTL_MS),
    });
  }

  /** Ask the user to confirm deleting their latest transaction. */
  async awaitDeleteConfirm(userId: string, now: Date): Promise<void> {
    await this.repository.set({
      userId,
      state: ConversationState.AWAITING_DELETE_CONFIRM,
      payload: null,
      expiresAt: new Date(now.getTime() + CONTEXT_TTL_MS),
    });
  }

  /** Ask the user to confirm wiping all of their data. */
  async awaitResetConfirm(userId: string, now: Date): Promise<void> {
    await this.repository.set({
      userId,
      state: ConversationState.AWAITING_CONFIRM,
      payload: { action: 'reset' },
      expiresAt: new Date(now.getTime() + CONTEXT_TTL_MS),
    });
  }

  clear(userId: string): Promise<void> {
    return this.repository.clear(userId);
  }
}
