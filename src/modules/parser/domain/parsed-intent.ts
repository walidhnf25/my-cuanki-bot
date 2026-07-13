import { BudgetPeriod, TransactionType } from 'src/shared/domain/enums';
import { Money } from 'src/shared/utils/money';

export enum IntentType {
  RecordTransaction = 'RECORD_TRANSACTION',
  Summary = 'SUMMARY',
  SetBudget = 'SET_BUDGET',
  EditTransaction = 'EDIT_TRANSACTION',
  DeleteTransaction = 'DELETE_TRANSACTION',
  SetReminder = 'SET_REMINDER',
  Export = 'EXPORT',
  Help = 'HELP',
  Greeting = 'GREETING',
  /** A bare amount ("25 ribu") — used to complete a pending clarification. */
  AmountOnly = 'AMOUNT_ONLY',
  Unknown = 'UNKNOWN',
}

export enum SummaryPeriod {
  Day = 'DAY',
  Week = 'WEEK',
  Month = 'MONTH',
}

interface BaseIntent {
  type: IntentType;
  /** Original (trimmed) message text. */
  raw: string;
}

export interface RecordTransactionIntent extends BaseIntent {
  type: IntentType.RecordTransaction;
  transactionType: TransactionType;
  /** null => amount missing; caller should ask for it (clarification flow). */
  amount: Money | null;
  description: string;
  /** Candidate keywords for category resolution (most specific first). */
  keywords: string[];
  occurredAt: Date;
}

export interface SummaryIntent extends BaseIntent {
  type: IntentType.Summary;
  period: SummaryPeriod;
}

export interface SetBudgetIntent extends BaseIntent {
  type: IntentType.SetBudget;
  amount: Money | null;
  keywords: string[];
  period: BudgetPeriod;
}

export interface EditTransactionIntent extends BaseIntent {
  type: IntentType.EditTransaction;
  /** New amount if the user provided one. */
  amount: Money | null;
  /** New category keywords if the user provided any. */
  keywords: string[];
}

export interface DeleteTransactionIntent extends BaseIntent {
  type: IntentType.DeleteTransaction;
}

export interface ReminderIntent extends BaseIntent {
  type: IntentType.SetReminder;
  title: string;
  /** Raw schedule phrase (e.g. "tiap tanggal 5") — compiled to cron in Phase 10. */
  schedulePhrase: string;
}

export interface ExportIntent extends BaseIntent {
  type: IntentType.Export;
  period: SummaryPeriod;
}

export interface HelpIntent extends BaseIntent {
  type: IntentType.Help;
}

export interface GreetingIntent extends BaseIntent {
  type: IntentType.Greeting;
}

export interface AmountOnlyIntent extends BaseIntent {
  type: IntentType.AmountOnly;
  amount: Money;
}

export interface UnknownIntent extends BaseIntent {
  type: IntentType.Unknown;
}

export type ParsedIntent =
  | RecordTransactionIntent
  | SummaryIntent
  | SetBudgetIntent
  | EditTransactionIntent
  | DeleteTransactionIntent
  | ReminderIntent
  | ExportIntent
  | HelpIntent
  | GreetingIntent
  | AmountOnlyIntent
  | UnknownIntent;
