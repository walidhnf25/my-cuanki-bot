import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  cellDate,
  cellMoney,
  cellRequiredString,
  cellString,
  cellWallet,
  dateCell,
  moneyCell,
} from 'src/sheets/cells';
import { SheetsClient } from 'src/sheets/sheets.client';
import { SheetRecord } from 'src/sheets/sheets.schema';
import { DEFAULT_WALLET, TransactionType, Wallet } from 'src/shared/domain/enums';
import { Money } from 'src/shared/utils/money';
import {
  CategoryTotal,
  CreateTransactionInput,
  DateRange,
  TransactionEntity,
  TypedTotals,
  UpdateTransactionInput,
} from '../domain/transaction.entity';
import { FindManyOptions, TransactionRepository } from '../domain/transaction.repository';

const SHEET = 'transactions';

interface TransactionRow {
  rowNumber: number;
  tx: TransactionEntity;
}

export function toTransactionEntity(data: SheetRecord): TransactionEntity {
  const createdAt = cellDate(data.created_at) ?? new Date(0);
  return {
    id: cellRequiredString(data.id),
    userId: cellRequiredString(data.user_id),
    categoryId: cellString(data.category_id),
    type: cellRequiredString(data.type) as TransactionType,
    amount: cellMoney(data.amount),
    description: cellRequiredString(data.description),
    note: cellString(data.note),
    occurredAt: cellDate(data.occurred_at) ?? createdAt,
    sourceMessage: cellString(data.source_message),
    messageId: cellString(data.message_id),
    wallet: cellWallet(data.wallet),
    deletedAt: cellDate(data.deleted_at),
    createdAt,
    updatedAt: cellDate(data.updated_at) ?? createdAt,
  };
}

function toRecord(tx: TransactionEntity): SheetRecord {
  return {
    id: tx.id,
    user_id: tx.userId,
    category_id: tx.categoryId,
    type: tx.type,
    amount: moneyCell(tx.amount),
    description: tx.description,
    note: tx.note,
    occurred_at: dateCell(tx.occurredAt),
    source_message: tx.sourceMessage,
    message_id: tx.messageId,
    deleted_at: dateCell(tx.deletedAt),
    created_at: dateCell(tx.createdAt),
    updated_at: dateCell(tx.updatedAt),
    wallet: tx.wallet,
  };
}

const inRange = (tx: TransactionEntity, range: DateRange): boolean =>
  tx.occurredAt.getTime() >= range.start.getTime() &&
  tx.occurredAt.getTime() <= range.end.getTime();

/**
 * Transactions tab. Aggregations (sums, grouping) run in memory over the rows
 * — fine for a personal ledger's volume. Deletes are soft (`deleted_at`).
 */
@Injectable()
export class SheetsTransactionRepository extends TransactionRepository {
  constructor(private readonly sheets: SheetsClient) {
    super();
  }

  async create(input: CreateTransactionInput): Promise<TransactionEntity> {
    const now = new Date();
    const tx: TransactionEntity = {
      id: randomUUID(),
      userId: input.userId,
      categoryId: input.categoryId ?? null,
      type: input.type,
      amount: input.amount,
      description: input.description,
      note: input.note ?? null,
      occurredAt: input.occurredAt,
      sourceMessage: input.sourceMessage ?? null,
      messageId: input.messageId ?? null,
      wallet: input.wallet ?? null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.sheets.append(SHEET, [toRecord(tx)]);
    return tx;
  }

  async findById(id: string): Promise<TransactionEntity | null> {
    return (await this.active()).find((r) => r.tx.id === id)?.tx ?? null;
  }

  async findLatestForUser(userId: string): Promise<TransactionEntity | null> {
    // Latest created; on a timestamp tie the later row (appended last) wins.
    const latest = (await this.active())
      .filter((r) => r.tx.userId === userId)
      .reduce<TransactionRow | null>(
        (best, r) => (!best || r.tx.createdAt.getTime() >= best.tx.createdAt.getTime() ? r : best),
        null,
      );
    return latest?.tx ?? null;
  }

  async findManyInRange(
    userId: string,
    range: DateRange,
    options?: FindManyOptions,
  ): Promise<TransactionEntity[]> {
    const rows = (await this.forUserInRange(userId, range))
      .filter((tx) => !options?.type || tx.type === options.type)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    return options?.limit ? rows.slice(0, options.limit) : rows;
  }

  async update(id: string, patch: UpdateTransactionInput): Promise<TransactionEntity> {
    const row = await this.requireRow(id);
    const updated: TransactionEntity = { ...row.tx, ...patch, updatedAt: new Date() };
    await this.sheets.update(SHEET, row.rowNumber, toRecord(updated));
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    const row = await this.requireRow(id);
    const now = new Date();
    await this.sheets.update(
      SHEET,
      row.rowNumber,
      toRecord({ ...row.tx, deletedAt: now, updatedAt: now }),
    );
  }

  async existsByMessageId(messageId: string): Promise<boolean> {
    return (await this.all()).some((r) => r.tx.messageId === messageId);
  }

  async sumByType(userId: string, range: DateRange): Promise<TypedTotals> {
    const totals: TypedTotals = { income: Money.zero(), expense: Money.zero() };
    for (const tx of await this.forUserInRange(userId, range)) {
      if (tx.type === TransactionType.INCOME) totals.income = totals.income.add(tx.amount);
      else totals.expense = totals.expense.add(tx.amount);
    }
    return totals;
  }

  async sumByWallet(userId: string, range?: DateRange): Promise<Record<Wallet, TypedTotals>> {
    const totals: Record<Wallet, TypedTotals> = {
      [Wallet.CASH]: { income: Money.zero(), expense: Money.zero() },
      [Wallet.DIGITAL]: { income: Money.zero(), expense: Money.zero() },
    };
    const txs = range
      ? await this.forUserInRange(userId, range)
      : (await this.active()).map((r) => r.tx).filter((tx) => tx.userId === userId);
    for (const tx of txs) {
      const bucket = totals[tx.wallet ?? DEFAULT_WALLET];
      if (tx.type === TransactionType.INCOME) bucket.income = bucket.income.add(tx.amount);
      else bucket.expense = bucket.expense.add(tx.amount);
    }
    return totals;
  }

  async findByNote(userId: string, note: string): Promise<TransactionEntity[]> {
    return (await this.active())
      .map((r) => r.tx)
      .filter((tx) => tx.userId === userId && tx.note === note);
  }

  async hasTransactionsInWallet(userId: string, wallet: Wallet): Promise<boolean> {
    return (await this.active()).some(
      (r) => r.tx.userId === userId && (r.tx.wallet ?? DEFAULT_WALLET) === wallet,
    );
  }

  async hasExplicitWallet(userId: string): Promise<boolean> {
    return (await this.active()).some((r) => r.tx.userId === userId && r.tx.wallet !== null);
  }

  async sumByCategory(
    userId: string,
    range: DateRange,
    type: TransactionType,
    wallet?: Wallet,
  ): Promise<CategoryTotal[]> {
    const totals = new Map<string | null, Money>();
    for (const tx of await this.forUserInRange(userId, range)) {
      if (tx.type !== type) continue;
      if (wallet && (tx.wallet ?? DEFAULT_WALLET) !== wallet) continue;
      totals.set(tx.categoryId, (totals.get(tx.categoryId) ?? Money.zero()).add(tx.amount));
    }
    return [...totals.entries()]
      .map(([categoryId, total]) => ({ categoryId, total }))
      .sort((a, b) => b.total.compareTo(a.total));
  }

  // ---- Internal ----

  private async all(): Promise<TransactionRow[]> {
    return (await this.sheets.getRows(SHEET)).map((r) => ({
      rowNumber: r.rowNumber,
      tx: toTransactionEntity(r.data),
    }));
  }

  private async active(): Promise<TransactionRow[]> {
    return (await this.all()).filter((r) => r.tx.deletedAt === null);
  }

  private async forUserInRange(userId: string, range: DateRange): Promise<TransactionEntity[]> {
    return (await this.active())
      .map((r) => r.tx)
      .filter((tx) => tx.userId === userId && inRange(tx, range));
  }

  private async requireRow(id: string): Promise<TransactionRow> {
    const row = (await this.active()).find((r) => r.tx.id === id);
    if (!row) throw new Error(`Transaction ${id} not found`);
    return row;
  }
}
