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
import { DEFAULT_WALLET, Wallet } from 'src/shared/domain/enums';
import { Money } from 'src/shared/utils/money';
import {
  CreateTransferInput,
  TransferEntity,
  TransferRange,
  TransferTotals,
} from '../domain/transfer.entity';
import { TransferRepository } from '../domain/transfer.repository';

const SHEET = 'transfers';

interface TransferRow {
  rowNumber: number;
  transfer: TransferEntity;
}

function toEntity(data: SheetRecord): TransferEntity {
  const createdAt = cellDate(data.created_at) ?? new Date(0);
  return {
    id: cellRequiredString(data.id),
    userId: cellRequiredString(data.user_id),
    from: cellWallet(data.from_wallet) ?? DEFAULT_WALLET,
    to: cellWallet(data.to_wallet) ?? DEFAULT_WALLET,
    amount: cellMoney(data.amount),
    note: cellString(data.note),
    occurredAt: cellDate(data.occurred_at) ?? createdAt,
    messageId: cellString(data.message_id),
    deletedAt: cellDate(data.deleted_at),
    createdAt,
  };
}

function toRecord(t: TransferEntity): SheetRecord {
  return {
    id: t.id,
    user_id: t.userId,
    from_wallet: t.from,
    to_wallet: t.to,
    amount: moneyCell(t.amount),
    note: t.note,
    occurred_at: dateCell(t.occurredAt),
    message_id: t.messageId,
    deleted_at: dateCell(t.deletedAt),
    created_at: dateCell(t.createdAt),
  };
}

const inRange = (t: TransferEntity, range: TransferRange): boolean =>
  t.occurredAt.getTime() >= range.start.getTime() && t.occurredAt.getTime() <= range.end.getTime();

/** Transfers tab. Deletes are soft (`deleted_at`), like transactions. */
@Injectable()
export class SheetsTransferRepository extends TransferRepository {
  constructor(private readonly sheets: SheetsClient) {
    super();
  }

  async create(input: CreateTransferInput): Promise<TransferEntity> {
    const transfer: TransferEntity = {
      id: randomUUID(),
      userId: input.userId,
      from: input.from,
      to: input.to,
      amount: input.amount,
      note: input.note ?? null,
      occurredAt: input.occurredAt,
      messageId: input.messageId ?? null,
      deletedAt: null,
      createdAt: new Date(),
    };
    await this.sheets.append(SHEET, [toRecord(transfer)]);
    return transfer;
  }

  async findLatestForUser(userId: string): Promise<TransferEntity | null> {
    // Latest created; on a timestamp tie the later row (appended last) wins.
    const latest = (await this.active())
      .filter((r) => r.transfer.userId === userId)
      .reduce<TransferRow | null>(
        (best, r) =>
          !best || r.transfer.createdAt.getTime() >= best.transfer.createdAt.getTime() ? r : best,
        null,
      );
    return latest?.transfer ?? null;
  }

  async softDelete(id: string): Promise<void> {
    const row = (await this.active()).find((r) => r.transfer.id === id);
    if (!row) throw new Error(`Transfer ${id} not found`);
    await this.sheets.update(
      SHEET,
      row.rowNumber,
      toRecord({ ...row.transfer, deletedAt: new Date() }),
    );
  }

  async existsByMessageId(messageId: string): Promise<boolean> {
    return (await this.all()).some((r) => r.transfer.messageId === messageId);
  }

  async findManyInRange(userId: string, range: TransferRange): Promise<TransferEntity[]> {
    return (await this.active())
      .map((r) => r.transfer)
      .filter((t) => t.userId === userId && inRange(t, range))
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  }

  async sumByWallet(
    userId: string,
    range?: TransferRange,
  ): Promise<Record<Wallet, TransferTotals>> {
    const totals: Record<Wallet, TransferTotals> = {
      [Wallet.CASH]: { in: Money.zero(), out: Money.zero() },
      [Wallet.DIGITAL]: { in: Money.zero(), out: Money.zero() },
    };
    for (const { transfer: t } of await this.active()) {
      if (t.userId !== userId || (range && !inRange(t, range))) continue;
      totals[t.from].out = totals[t.from].out.add(t.amount);
      totals[t.to].in = totals[t.to].in.add(t.amount);
    }
    return totals;
  }

  async hasAny(userId: string): Promise<boolean> {
    return (await this.active()).some((r) => r.transfer.userId === userId);
  }

  // ---- Internal ----

  private async all(): Promise<TransferRow[]> {
    return (await this.sheets.getRows(SHEET)).map((r) => ({
      rowNumber: r.rowNumber,
      transfer: toEntity(r.data),
    }));
  }

  private async active(): Promise<TransferRow[]> {
    return (await this.all()).filter((r) => r.transfer.deletedAt === null);
  }
}
