import { Module } from '@nestjs/common';
import { ResetUserDataService } from './application/reset-user-data.service';
import { UserRepository } from './domain/user.repository';
import { SheetsUserRepository } from './infrastructure/sheets-user.repository';

/**
 * User module. Binds the UserRepository port to its Google Sheets implementation and
 * provides the per-user data reset use-case.
 */
@Module({
  providers: [{ provide: UserRepository, useClass: SheetsUserRepository }, ResetUserDataService],
  exports: [UserRepository, ResetUserDataService],
})
export class UserModule {}
