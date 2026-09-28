import { Money } from 'src/shared/utils/money';
import { TransactionType } from 'src/shared/domain/enums';

export interface TransactionEntity {
  id: string;
  userId: string;
  categoryId: string | null;
  type: TransactionType;
  amount: Money;
  description: string;
  note: string | null;
  occurredAt: Date;
  sourceMessage: string | null;
  messageId: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTransactionInput {
  userId: string;
  categoryId?: string | null;
  type: TransactionType;
  amount: Money;
  description: string;
  note?: string | null;
  occurredAt: Date;
  sourceMessage?: string | null;
  messageId?: string | null;
}

export interface UpdateTransactionInput {
  categoryId?: string | null;
  type?: TransactionType;
  amount?: Money;
  description?: string;
  note?: string | null;
  occurredAt?: Date;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface TypedTotals {
  income: Money;
  expense: Money;
}

export interface CategoryTotal {
  categoryId: string | null;
  total: Money;
}
