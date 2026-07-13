import { Injectable } from '@nestjs/common';
import { ConversationService } from 'src/modules/conversation/application/conversation.service';
import { ConversationContextEntity } from 'src/modules/conversation/domain/conversation-context.entity';
import { PendingTransaction } from 'src/modules/conversation/domain/pending-transaction';
import { MessageParser } from 'src/modules/parser/domain/message-parser.port';
import { IntentType, ParsedIntent } from 'src/modules/parser/domain/parsed-intent';
import { TransactionService } from 'src/modules/transaction/application/transaction.service';
import { ConversationState } from 'src/shared/domain/enums';
import { Money } from 'src/shared/utils/money';
import { tokenize } from 'src/shared/utils/string-normalizer';
import { UserEntity } from 'src/modules/user/domain/user.entity';
import { IncomingMessage } from '../domain/messaging.gateway.port';
import { ReplyBuilder } from './reply-builder';

const YES_WORDS = ['ya', 'iya', 'yoi', 'yes', 'yup', 'ok', 'oke', 'sip', 'benar', 'y'];
const NO_WORDS = ['tidak', 'ga', 'gak', 'nggak', 'engga', 'enggak', 'no', 'batal', 'jangan', 'n'];

/**
 * Stateful entry point for inbound messages. Consults the conversation context
 * to continue a multi-turn flow (missing amount, delete confirmation); otherwise
 * routes the parsed intent. Returns the reply text ('' = send nothing).
 */
@Injectable()
export class MessageOrchestrator {
  constructor(
    private readonly parser: MessageParser,
    private readonly conversation: ConversationService,
    private readonly transactions: TransactionService,
    private readonly replies: ReplyBuilder,
  ) {}

  async process(user: UserEntity, message: IncomingMessage): Promise<string> {
    const now = message.timestamp;
    const context = await this.conversation.getActive(user.id, now);
    const intent = await this.parser.parse({
      text: message.text,
      now,
      timezone: user.timezone,
    });

    if (context) {
      const continued = await this.continue(user, context, intent, message);
      if (continued !== null) return continued;
      // User changed topic — drop the pending context and route the new intent.
      await this.conversation.clear(user.id);
    }

    return this.routeFresh(user, intent, message);
  }

  /** Returns a reply when the context handled the message, or null to fall through. */
  private async continue(
    user: UserEntity,
    context: ConversationContextEntity,
    intent: ParsedIntent,
    message: IncomingMessage,
  ): Promise<string | null> {
    if (context.state === ConversationState.AWAITING_AMOUNT) {
      if (intent.type === IntentType.AmountOnly) {
        const result = await this.completePending(
          user.id,
          context.payload,
          intent.amount,
          message.waMessageId,
        );
        await this.conversation.clear(user.id);
        return result ? this.replies.recorded(result, user.timezone) : '';
      }
      if (intent.type === IntentType.Unknown || intent.type === IntentType.Greeting) {
        return this.replies.askAmount();
      }
      return null;
    }

    if (context.state === ConversationState.AWAITING_DELETE_CONFIRM) {
      const answer = this.yesNo(message.text);
      if (answer === 'yes') {
        const deleted = await this.transactions.deleteLast(user.id);
        await this.conversation.clear(user.id);
        return deleted ? this.replies.deleted(deleted) : this.replies.nothingToDelete();
      }
      if (answer === 'no') {
        await this.conversation.clear(user.id);
        return this.replies.cancelled();
      }
      if (intent.type === IntentType.Unknown || intent.type === IntentType.Greeting) {
        return this.replies.deleteConfirmRetry();
      }
      return null;
    }

    return null;
  }

  private async routeFresh(
    user: UserEntity,
    intent: ParsedIntent,
    message: IncomingMessage,
  ): Promise<string> {
    switch (intent.type) {
      case IntentType.RecordTransaction: {
        if (intent.amount !== null) {
          const result = await this.transactions.record(user.id, intent, message.waMessageId);
          return result ? this.replies.recorded(result, user.timezone) : '';
        }
        // Missing amount — remember the transaction and ask for the price.
        await this.conversation.awaitAmount(
          user.id,
          {
            transactionType: intent.transactionType,
            description: intent.description,
            keywords: intent.keywords,
            occurredAt: intent.occurredAt.toISOString(),
          },
          message.timestamp,
        );
        return this.replies.askAmount(intent.description);
      }
      case IntentType.EditTransaction: {
        const result = await this.transactions.editLast(user.id, intent);
        return result ? this.replies.edited(result, user.timezone) : this.replies.nothingToEdit();
      }
      case IntentType.DeleteTransaction: {
        const last = await this.transactions.getLast(user.id);
        if (!last) return this.replies.nothingToDelete();
        await this.conversation.awaitDeleteConfirm(user.id, message.timestamp);
        return this.replies.deleteConfirm(last);
      }
      default:
        return this.replies.compose(intent);
    }
  }

  private completePending(
    userId: string,
    payload: Record<string, unknown> | null,
    amount: Money,
    waMessageId: string,
  ): ReturnType<TransactionService['record']> {
    if (!payload) return Promise.resolve(null);
    const pending = payload as unknown as PendingTransaction;
    return this.transactions.record(
      userId,
      {
        type: IntentType.RecordTransaction,
        raw: '',
        transactionType: pending.transactionType,
        amount,
        description: pending.description,
        keywords: pending.keywords,
        occurredAt: new Date(pending.occurredAt),
      },
      waMessageId,
    );
  }

  private yesNo(text: string): 'yes' | 'no' | null {
    const tokens = new Set(tokenize(text));
    if (YES_WORDS.some((w) => tokens.has(w))) return 'yes';
    if (NO_WORDS.some((w) => tokens.has(w))) return 'no';
    return null;
  }
}
