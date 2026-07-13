import { BudgetPeriod } from 'src/shared/domain/enums';
import { BudgetEntity, UpsertBudgetInput } from './budget.entity';

export abstract class BudgetRepository {
  /** Create or replace the budget for (user, category, period). */
  abstract upsert(input: UpsertBudgetInput): Promise<BudgetEntity>;

  abstract findForUser(userId: string): Promise<BudgetEntity[]>;

  abstract findByCategoryPeriod(
    userId: string,
    categoryId: string | null,
    period: BudgetPeriod,
  ): Promise<BudgetEntity | null>;

  abstract delete(id: string): Promise<void>;
}
