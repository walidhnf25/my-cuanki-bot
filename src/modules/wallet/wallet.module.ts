import { Module } from '@nestjs/common';
import { CategoryModule } from '../category/category.module';
import { TransactionModule } from '../transaction/transaction.module';
import { UserModule } from '../user/user.module';
import { WalletService } from './application/wallet.service';
import { TransferRepository } from './domain/transfer.repository';
import { SheetsTransferRepository } from './infrastructure/sheets-transfer.repository';

@Module({
  imports: [TransactionModule, UserModule, CategoryModule],
  providers: [{ provide: TransferRepository, useClass: SheetsTransferRepository }, WalletService],
  exports: [WalletService],
})
export class WalletModule {}
