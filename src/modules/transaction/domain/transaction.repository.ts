import { TransactionType } from 'src/shared/domain/enums';
import {
  CategoryTotal,
  CreateTransactionInput,
  DateRange,
  TransactionEntity,
  TypedTotals,
  UpdateTransactionInput,
} from './transaction.entity';

export interface FindManyOptions {
  type?: TransactionType;
  limit?: number;
}

export abstract class TransactionRepository {
  abstract create(input: CreateTransactionInput): Promise<TransactionEntity>;

  abstract findById(id: string): Promise<TransactionEntity | null>;

  /** Most recent non-deleted transaction for the user. */
  abstract findLatestForUser(userId: string): Promise<TransactionEntity | null>;

  abstract findManyInRange(
    userId: string,
    range: DateRange,
    options?: FindManyOptions,
  ): Promise<TransactionEntity[]>;

  abstract update(id: string, patch: UpdateTransactionInput): Promise<TransactionEntity>;

  abstract softDelete(id: string): Promise<void>;

  /** Idempotency guard for inbound WhatsApp messages. */
  abstract existsByWaMessageId(waMessageId: string): Promise<boolean>;

  /** Total income and expense within the range (deleted excluded). */
  abstract sumByType(userId: string, range: DateRange): Promise<TypedTotals>;

  /** Per-category totals for a given type within the range. */
  abstract sumByCategory(
    userId: string,
    range: DateRange,
    type: TransactionType,
  ): Promise<CategoryTotal[]>;
}
