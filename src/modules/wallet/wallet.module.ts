import { Module } from '@nestjs/common';
import { CategoryModule } from '../category/category.module';
import { TransactionModule } from '../transaction/transaction.module';
import { UserModule } from '../user/user.module';
import { WalletService } from './application/wallet.service';

@Module({
  imports: [TransactionModule, UserModule, CategoryModule],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
