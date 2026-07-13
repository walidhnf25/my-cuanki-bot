import { Injectable } from '@nestjs/common';
import { IntentType, ParsedIntent } from 'src/modules/parser/domain/parsed-intent';
import { TransactionService } from 'src/modules/transaction/application/transaction.service';
import { ReplyBuilder } from './reply-builder';

/**
 * Maps a parsed intent to an action (via application services) and returns the
 * reply text. Transactional intents are handled here; everything else falls
 * back to the ReplyBuilder (summaries/budgets/reminders land in later phases).
 * Returns an empty string when no reply should be sent (e.g. idempotent replay).
 */
@Injectable()
export class CommandRouter {
  constructor(
    private readonly transactions: TransactionService,
    private readonly replies: ReplyBuilder,
  ) {}

  async route(
    userId: string,
    timezone: string,
    intent: ParsedIntent,
    waMessageId: string,
  ): Promise<string> {
    switch (intent.type) {
      case IntentType.RecordTransaction: {
        if (intent.amount === null) return this.replies.askAmount();
        const result = await this.transactions.record(userId, intent, waMessageId);
        return result ? this.replies.recorded(result, timezone) : '';
      }
      case IntentType.EditTransaction: {
        const result = await this.transactions.editLast(userId, intent);
        return result ? this.replies.edited(result, timezone) : this.replies.nothingToEdit();
      }
      case IntentType.DeleteTransaction: {
        const result = await this.transactions.deleteLast(userId);
        return result ? this.replies.deleted(result) : this.replies.nothingToDelete();
      }
      default:
        return this.replies.compose(intent);
    }
  }
}
