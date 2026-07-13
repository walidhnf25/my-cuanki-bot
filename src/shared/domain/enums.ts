/**
 * Domain-level enums. Values are intentionally identical to the Prisma enums
 * so mappers can cast between them, but the domain does not import Prisma —
 * keeping the core independent of the persistence detail.
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
