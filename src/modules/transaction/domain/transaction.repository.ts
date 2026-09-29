import { TransactionType, Wallet } from 'src/shared/domain/enums';
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

  /** Idempotency guard for inbound chat messages. */
  abstract existsByMessageId(messageId: string): Promise<boolean>;

  /** Total income and expense within the range (deleted excluded). */
  abstract sumByType(userId: string, range: DateRange): Promise<TypedTotals>;

  /** Per-category totals for a given type within the range. */
  /**
   * Income/expense per wallet (deleted excluded); all time when no range is given.
   * Rows without a wallet count as CASH.
   */
  abstract sumByWallet(userId: string, range?: DateRange): Promise<Record<Wallet, TypedTotals>>;

  /** Non-deleted transactions of the user carrying the given note marker. */
  abstract findByNote(userId: string, note: string): Promise<TransactionEntity[]>;

  /** True when any non-deleted transaction sits in the wallet (blank counts as CASH). */
  abstract hasTransactionsInWallet(userId: string, wallet: Wallet): Promise<boolean>;

  /** True once the user has at least one transaction with an explicit wallet. */
  abstract hasExplicitWallet(userId: string): Promise<boolean>;

  abstract sumByCategory(
    userId: string,
    range: DateRange,
    type: TransactionType,
    wallet?: Wallet,
  ): Promise<CategoryTotal[]>;
}
