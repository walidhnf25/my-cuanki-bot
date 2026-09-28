import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  cellDate,
  cellMoney,
  cellNumber,
  cellRequiredString,
  cellString,
  dateCell,
  moneyCell,
} from 'src/sheets/cells';
import { SheetsClient } from 'src/sheets/sheets.client';
import { SheetRecord } from 'src/sheets/sheets.schema';
import { BudgetPeriod } from 'src/shared/domain/enums';
import { BudgetEntity, UpsertBudgetInput } from '../domain/budget.entity';
import { BudgetRepository } from '../domain/budget.repository';

const SHEET = 'budgets';
const DEFAULT_ALERT_THRESHOLD = 80;

interface BudgetRow {
  rowNumber: number;
  budget: BudgetEntity;
}

function toEntity(data: SheetRecord): BudgetEntity {
  const createdAt = cellDate(data.created_at) ?? new Date(0);
  return {
    id: cellRequiredString(data.id),
    userId: cellRequiredString(data.user_id),
    categoryId: cellString(data.category_id),
    amount: cellMoney(data.amount),
    period: (cellString(data.period) ?? BudgetPeriod.MONTHLY) as BudgetPeriod,
    alertThreshold: cellNumber(data.alert_threshold) ?? DEFAULT_ALERT_THRESHOLD,
    createdAt,
    updatedAt: cellDate(data.updated_at) ?? createdAt,
  };
}

function toRecord(budget: BudgetEntity): SheetRecord {
  return {
    id: budget.id,
    user_id: budget.userId,
    category_id: budget.categoryId,
    amount: moneyCell(budget.amount),
    period: budget.period,
    alert_threshold: budget.alertThreshold,
    created_at: dateCell(budget.createdAt),
    updated_at: dateCell(budget.updatedAt),
  };
}

@Injectable()
export class SheetsBudgetRepository extends BudgetRepository {
  constructor(private readonly sheets: SheetsClient) {
    super();
  }

  /** One budget per (user, category, period); a null category is the overall budget. */
  async upsert(input: UpsertBudgetInput): Promise<BudgetEntity> {
    const categoryId = input.categoryId ?? null;
    const existing = await this.findRow(input.userId, categoryId, input.period);
    const now = new Date();

    if (existing) {
      const updated: BudgetEntity = {
        ...existing.budget,
        amount: input.amount,
        ...(input.alertThreshold !== undefined ? { alertThreshold: input.alertThreshold } : {}),
        updatedAt: now,
      };
      await this.sheets.update(SHEET, existing.rowNumber, toRecord(updated));
      return updated;
    }

    const budget: BudgetEntity = {
      id: randomUUID(),
      userId: input.userId,
      categoryId,
      amount: input.amount,
      period: input.period,
      alertThreshold: input.alertThreshold ?? DEFAULT_ALERT_THRESHOLD,
      createdAt: now,
      updatedAt: now,
    };
    await this.sheets.append(SHEET, [toRecord(budget)]);
    return budget;
  }

  async findForUser(userId: string): Promise<BudgetEntity[]> {
    return (await this.all()).filter((r) => r.budget.userId === userId).map((r) => r.budget);
  }

  async findByCategoryPeriod(
    userId: string,
    categoryId: string | null,
    period: BudgetPeriod,
  ): Promise<BudgetEntity | null> {
    return (await this.findRow(userId, categoryId, period))?.budget ?? null;
  }

  async delete(id: string): Promise<void> {
    const row = (await this.all()).find((r) => r.budget.id === id);
    if (row) await this.sheets.deleteRows([{ sheet: SHEET, rowNumbers: [row.rowNumber] }]);
  }

  private async findRow(
    userId: string,
    categoryId: string | null,
    period: BudgetPeriod,
  ): Promise<BudgetRow | undefined> {
    return (await this.all()).find(
      ({ budget }) =>
        budget.userId === userId && budget.categoryId === categoryId && budget.period === period,
    );
  }

  private async all(): Promise<BudgetRow[]> {
    return (await this.sheets.getRows(SHEET)).map((r) => ({
      rowNumber: r.rowNumber,
      budget: toEntity(r.data),
    }));
  }
}
