import { Injectable } from '@nestjs/common';
import { BudgetService } from 'src/modules/budget/application/budget.service';
import { ConversationService } from 'src/modules/conversation/application/conversation.service';
import { ConversationContextEntity } from 'src/modules/conversation/domain/conversation-context.entity';
import { PendingTransaction } from 'src/modules/conversation/domain/pending-transaction';
import { MessageParser } from 'src/modules/parser/domain/message-parser.port';
import {
  IntentType,
  ParsedIntent,
  RecordTransactionIntent,
} from 'src/modules/parser/domain/parsed-intent';
import { CsvExportService } from 'src/modules/report/application/csv-export.service';
import { ReportService } from 'src/modules/report/application/report.service';
import { TransactionService } from 'src/modules/transaction/application/transaction.service';
import { ResetUserDataService } from 'src/modules/user/application/reset-user-data.service';
import { UserEntity } from 'src/modules/user/domain/user.entity';
import { ConversationState, TransactionType } from 'src/shared/domain/enums';
import { Money } from 'src/shared/utils/money';
import { tokenize } from 'src/shared/utils/string-normalizer';
import { IncomingMessage } from '../domain/messaging.gateway.port';
import { ReplyBuilder } from './reply-builder';

const YES_WORDS = ['ya', 'iya', 'yoi', 'yes', 'yup', 'ok', 'oke', 'sip', 'benar', 'y'];
const NO_WORDS = ['tidak', 'ga', 'gak', 'nggak', 'engga', 'enggak', 'no', 'batal', 'jangan', 'n'];

/** A reply to send back: text and/or a document (Excel export). Empty = send nothing. */
export interface OutgoingReply {
  text?: string;
  document?: { content: Buffer; filename: string; mimeType: string };
}

/**
 * Stateful entry point for inbound messages: consults the conversation context
 * to continue a multi-turn flow, otherwise routes the parsed intent to the
 * relevant application service and produces the reply.
 */
@Injectable()
export class MessageOrchestrator {
  constructor(
    private readonly parser: MessageParser,
    private readonly conversation: ConversationService,
    private readonly transactions: TransactionService,
    private readonly budgets: BudgetService,
    private readonly reports: ReportService,
    private readonly csvExport: CsvExportService,
    private readonly resetData: ResetUserDataService,
    private readonly replies: ReplyBuilder,
  ) {}

  async process(user: UserEntity, message: IncomingMessage): Promise<OutgoingReply> {
    const now = message.timestamp;
    const context = await this.conversation.getActive(user.id, now);
    const intent = await this.parser.parse({ text: message.text, now, timezone: user.timezone });

    if (context) {
      const continued = await this.continue(user, context, intent, message);
      if (continued !== null) return continued;
      await this.conversation.clear(user.id);
    }

    return this.routeFresh(user, intent, message);
  }

  private async continue(
    user: UserEntity,
    context: ConversationContextEntity,
    intent: ParsedIntent,
    message: IncomingMessage,
  ): Promise<OutgoingReply | null> {
    if (context.state === ConversationState.AWAITING_AMOUNT) {
      if (intent.type === IntentType.AmountOnly) {
        const reply = await this.completePending(user, context.payload, intent.amount, message);
        await this.conversation.clear(user.id);
        return reply;
      }
      if (intent.type === IntentType.Unknown || intent.type === IntentType.Greeting) {
        return { text: this.replies.askAmount() };
      }
      return null;
    }

    if (context.state === ConversationState.AWAITING_DELETE_CONFIRM) {
      const answer = this.yesNo(message.text);
      if (answer === 'yes') {
        const deleted = await this.transactions.deleteLast(user.id);
        await this.conversation.clear(user.id);
        return {
          text: deleted ? this.replies.deleted(deleted) : this.replies.nothingToDelete(),
        };
      }
      if (answer === 'no') {
        await this.conversation.clear(user.id);
        return { text: this.replies.cancelled() };
      }
      if (intent.type === IntentType.Unknown || intent.type === IntentType.Greeting) {
        return { text: this.replies.deleteConfirmRetry() };
      }
      return null;
    }

    if (context.state === ConversationState.AWAITING_CONFIRM) {
      const action = (context.payload as { action?: string } | null)?.action;
      if (action !== 'reset') return null;

      const answer = this.yesNo(message.text);
      if (answer === 'yes') {
        await this.resetData.reset(user.id);
        await this.conversation.clear(user.id);
        return { text: this.replies.dataReset() };
      }
      if (answer === 'no') {
        await this.conversation.clear(user.id);
        return { text: this.replies.cancelled() };
      }
      if (intent.type === IntentType.Unknown || intent.type === IntentType.Greeting) {
        return { text: this.replies.resetConfirmRetry() };
      }
      return null;
    }

    return null;
  }

  private async routeFresh(
    user: UserEntity,
    intent: ParsedIntent,
    message: IncomingMessage,
  ): Promise<OutgoingReply> {
    const now = message.timestamp;

    switch (intent.type) {
      case IntentType.RecordTransaction: {
        if (intent.amount !== null) {
          return this.recordAndReply(user, intent, message.messageId, now);
        }
        await this.conversation.awaitAmount(
          user.id,
          {
            transactionType: intent.transactionType,
            description: intent.description,
            keywords: intent.keywords,
            occurredAt: intent.occurredAt.toISOString(),
          },
          now,
        );
        return { text: this.replies.askAmount(intent.description) };
      }

      case IntentType.EditTransaction: {
        const result = await this.transactions.editLast(user.id, intent);
        return {
          text: result ? this.replies.edited(result, user.timezone) : this.replies.nothingToEdit(),
        };
      }

      case IntentType.DeleteTransaction: {
        const last = await this.transactions.getLast(user.id);
        if (!last) return { text: this.replies.nothingToDelete() };
        await this.conversation.awaitDeleteConfirm(user.id, now);
        return { text: this.replies.deleteConfirm(last) };
      }

      case IntentType.Summary: {
        const summary = await this.reports.generateSummary(
          user.id,
          intent.period,
          now,
          user.timezone,
          intent.customRange,
        );
        return { text: this.replies.summary(summary) };
      }

      case IntentType.SetBudget: {
        if (intent.amount === null) {
          return { text: 'Sebutkan nominal budget. Contoh: _budget makan 2 juta_' };
        }
        const result = await this.budgets.setBudget(
          user.id,
          intent.keywords,
          intent.amount,
          intent.period,
        );
        return { text: this.replies.budgetSet(result) };
      }

      case IntentType.Export: {
        const csv = await this.csvExport.export(
          user.id,
          intent.period,
          now,
          user.timezone,
          intent.customRange,
        );
        return {
          text: this.replies.exportCaption(csv.rowCount),
          document:
            csv.rowCount > 0
              ? { content: csv.content, filename: csv.filename, mimeType: csv.mimeType }
              : undefined,
        };
      }

      case IntentType.ResetData: {
        await this.conversation.awaitResetConfirm(user.id, now);
        return { text: this.replies.resetConfirm() };
      }

      default:
        return { text: this.replies.compose(intent) };
    }
  }

  private async recordAndReply(
    user: UserEntity,
    intent: RecordTransactionIntent,
    messageId: string,
    now: Date,
  ): Promise<OutgoingReply> {
    const result = await this.transactions.record(user.id, intent, messageId);
    if (!result) return {};

    let text = this.replies.recorded(result, user.timezone);
    if (result.transaction.type === TransactionType.EXPENSE) {
      const alerts = await this.budgets.evaluate(
        user.id,
        result.transaction.categoryId,
        now,
        user.timezone,
      );
      if (alerts.length > 0) {
        text += `\n\n${this.replies.budgetAlerts(alerts)}`;
      }
    }
    return { text };
  }

  private completePending(
    user: UserEntity,
    payload: Record<string, unknown> | null,
    amount: Money,
    message: IncomingMessage,
  ): Promise<OutgoingReply> {
    if (!payload) return Promise.resolve({});
    const pending = payload as unknown as PendingTransaction;
    const intent: RecordTransactionIntent = {
      type: IntentType.RecordTransaction,
      raw: message.text,
      transactionType: pending.transactionType,
      amount,
      description: pending.description,
      keywords: pending.keywords,
      occurredAt: new Date(pending.occurredAt),
    };
    return this.recordAndReply(user, intent, message.messageId, message.timestamp);
  }

  private yesNo(text: string): 'yes' | 'no' | null {
    const tokens = new Set(tokenize(text));
    if (YES_WORDS.some((w) => tokens.has(w))) return 'yes';
    if (NO_WORDS.some((w) => tokens.has(w))) return 'no';
    return null;
  }
}
