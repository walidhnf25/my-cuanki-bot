import { Module } from '@nestjs/common';
import { BudgetRepository } from './domain/budget.repository';
import { PrismaBudgetRepository } from './infrastructure/prisma-budget.repository';

@Module({
  providers: [{ provide: BudgetRepository, useClass: PrismaBudgetRepository }],
  exports: [BudgetRepository],
})
export class BudgetModule {}
