import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { BudgetPeriod } from 'src/shared/domain/enums';
import { BudgetEntity, UpsertBudgetInput } from '../domain/budget.entity';
import { BudgetRepository } from '../domain/budget.repository';
import { toBudgetEntity } from './budget.mapper';

@Injectable()
export class PrismaBudgetRepository extends BudgetRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Manual upsert. We don't use prisma.upsert because the unique key includes a
   * nullable categoryId, and SQL treats NULLs as distinct — an upsert keyed on a
   * null category would create duplicates rather than update.
   */
  async upsert(input: UpsertBudgetInput): Promise<BudgetEntity> {
    const categoryId = input.categoryId ?? null;
    const existing = await this.prisma.budget.findFirst({
      where: {
        userId: input.userId,
        categoryId,
        period: input.period,
      },
    });

    if (existing) {
      const row = await this.prisma.budget.update({
        where: { id: existing.id },
        data: {
          amount: input.amount.toDecimalString(),
          ...(input.alertThreshold !== undefined ? { alertThreshold: input.alertThreshold } : {}),
        },
      });
      return toBudgetEntity(row);
    }

    const row = await this.prisma.budget.create({
      data: {
        userId: input.userId,
        categoryId,
        amount: input.amount.toDecimalString(),
        period: input.period,
        ...(input.alertThreshold !== undefined ? { alertThreshold: input.alertThreshold } : {}),
      },
    });
    return toBudgetEntity(row);
  }

  async findForUser(userId: string): Promise<BudgetEntity[]> {
    const rows = await this.prisma.budget.findMany({ where: { userId } });
    return rows.map(toBudgetEntity);
  }

  async findByCategoryPeriod(
    userId: string,
    categoryId: string | null,
    period: BudgetPeriod,
  ): Promise<BudgetEntity | null> {
    const row = await this.prisma.budget.findFirst({
      where: { userId, categoryId, period: period },
    });
    return row ? toBudgetEntity(row) : null;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.budget.delete({ where: { id } });
  }
}
