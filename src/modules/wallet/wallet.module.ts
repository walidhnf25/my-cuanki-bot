import { Module } from '@nestjs/common';
import { TransactionModule } from '../transaction/transaction.module';
import { UserModule } from '../user/user.module';
import { WalletService } from './application/wallet.service';

@Module({
  imports: [TransactionModule, UserModule],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
