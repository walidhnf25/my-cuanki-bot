/**
 * Domain-level enums. The string values are what gets stored in the
 * spreadsheet, so they must stay stable. The domain never imports storage
 * code, keeping the core independent of the persistence detail.
 */

export enum TransactionType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
}

export enum BudgetPeriod {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
}

export enum ConversationState {
  IDLE = 'IDLE',
  AWAITING_AMOUNT = 'AWAITING_AMOUNT',
  AWAITING_CATEGORY = 'AWAITING_CATEGORY',
  AWAITING_CONFIRM = 'AWAITING_CONFIRM',
  AWAITING_DELETE_CONFIRM = 'AWAITING_DELETE_CONFIRM',
}
