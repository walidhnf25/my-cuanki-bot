import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  cellBoolean,
  cellDate,
  cellOptionalMoney,
  cellRequiredString,
  cellString,
  cellWallet,
  dateCell,
  moneyCell,
} from 'src/sheets/cells';
import { SheetsClient } from 'src/sheets/sheets.client';
import { SheetRecord, SheetRow } from 'src/sheets/sheets.schema';
import { DEFAULT_TIMEZONE } from 'src/shared/utils/date.util';
import { CreateUserInput, UpdateUserInput, UserEntity } from '../domain/user.entity';
import { UserRepository } from '../domain/user.repository';

const SHEET = 'users';

function toEntity(data: SheetRecord): UserEntity {
  const createdAt = cellDate(data.created_at) ?? new Date(0);
  return {
    id: cellRequiredString(data.id),
    telegramId: cellRequiredString(data.telegram_id),
    chatId: cellString(data.chat_id),
    displayName: cellString(data.display_name),
    currency: cellString(data.currency) ?? 'IDR',
    timezone: cellString(data.timezone) ?? DEFAULT_TIMEZONE,
    isOnboarded: cellBoolean(data.is_onboarded),
    defaultWallet: cellWallet(data.default_wallet),
    openingCash: cellOptionalMoney(data.opening_cash),
    openingDigital: cellOptionalMoney(data.opening_digital),
    createdAt,
    updatedAt: cellDate(data.updated_at) ?? createdAt,
  };
}

function toRecord(user: UserEntity): SheetRecord {
  return {
    id: user.id,
    telegram_id: user.telegramId,
    chat_id: user.chatId,
    display_name: user.displayName,
    currency: user.currency,
    timezone: user.timezone,
    is_onboarded: user.isOnboarded,
    created_at: dateCell(user.createdAt),
    updated_at: dateCell(user.updatedAt),
    default_wallet: user.defaultWallet,
    opening_cash: user.openingCash ? moneyCell(user.openingCash) : null,
    opening_digital: user.openingDigital ? moneyCell(user.openingDigital) : null,
  };
}

@Injectable()
export class SheetsUserRepository extends UserRepository {
  constructor(private readonly sheets: SheetsClient) {
    super();
  }

  async findById(id: string): Promise<UserEntity | null> {
    const row = (await this.sheets.getRows(SHEET)).find((r) => cellString(r.data.id) === id);
    return row ? toEntity(row.data) : null;
  }

  async findByTelegramId(telegramId: string): Promise<UserEntity | null> {
    const row = await this.findRowByTelegramId(telegramId);
    return row ? toEntity(row.data) : null;
  }

  async findOrCreate(input: CreateUserInput): Promise<{ user: UserEntity; created: boolean }> {
    const existing = await this.findRowByTelegramId(input.telegramId);
    if (existing) {
      const user = toEntity(existing.data);
      // Keep the reply address fresh.
      if (input.chatId && input.chatId !== user.chatId) {
        const updated = { ...user, chatId: input.chatId, updatedAt: new Date() };
        await this.sheets.update(SHEET, existing.rowNumber, toRecord(updated));
        return { user: updated, created: false };
      }
      return { user, created: false };
    }

    const now = new Date();
    const user: UserEntity = {
      id: randomUUID(),
      telegramId: input.telegramId,
      chatId: input.chatId ?? null,
      displayName: input.displayName ?? null,
      currency: 'IDR',
      timezone: DEFAULT_TIMEZONE,
      isOnboarded: false,
      defaultWallet: null,
      openingCash: null,
      openingDigital: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.sheets.append(SHEET, [toRecord(user)]);

    // A spreadsheet has no unique constraint: if a concurrent request created
    // the same user, the first row wins and the loser reuses it.
    const winner = await this.findRowByTelegramId(input.telegramId);
    if (winner && cellString(winner.data.id) !== user.id) {
      return { user: toEntity(winner.data), created: false };
    }
    return { user, created: true };
  }

  async update(id: string, patch: UpdateUserInput): Promise<UserEntity> {
    const row = (await this.sheets.getRows(SHEET)).find((r) => cellString(r.data.id) === id);
    if (!row) throw new Error(`User ${id} not found`);
    const updated: UserEntity = { ...toEntity(row.data), ...patch, updatedAt: new Date() };
    await this.sheets.update(SHEET, row.rowNumber, toRecord(updated));
    return updated;
  }

  private async findRowByTelegramId(telegramId: string): Promise<SheetRow | undefined> {
    const rows = await this.sheets.getRows(SHEET);
    return rows.find((r) => cellString(r.data.telegram_id) === telegramId);
  }
}
