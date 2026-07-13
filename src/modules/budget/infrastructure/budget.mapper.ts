import type { Budget as PrismaBudget } from '@prisma/client';
import { BudgetPeriod } from 'src/shared/domain/enums';
import { Money } from 'src/shared/utils/money';
import { BudgetEntity } from '../domain/budget.entity';

export function toBudgetEntity(row: PrismaBudget): BudgetEntity {
  return {
    id: row.id,
    userId: row.userId,
    categoryId: row.categoryId,
    amount: Money.fromMajor(row.amount.toString()),
    period: row.period as BudgetPeriod,
    alertThreshold: row.alertThreshold,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
