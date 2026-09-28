import { Module } from '@nestjs/common';
import { CategoryModule } from '../category/category.module';
import { TransactionModule } from '../transaction/transaction.module';
import { BudgetService } from './application/budget.service';
import { BudgetRepository } from './domain/budget.repository';
import { SheetsBudgetRepository } from './infrastructure/sheets-budget.repository';

@Module({
  imports: [CategoryModule, TransactionModule],
  providers: [{ provide: BudgetRepository, useClass: SheetsBudgetRepository }, BudgetService],
  exports: [BudgetRepository, BudgetService],
})
export class BudgetModule {}
