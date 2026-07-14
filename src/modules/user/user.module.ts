import { Module } from '@nestjs/common';
import { ResetUserDataService } from './application/reset-user-data.service';
import { UserRepository } from './domain/user.repository';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository';

/**
 * User module. Binds the UserRepository port to its Prisma implementation and
 * provides the per-user data reset use-case.
 */
@Module({
  providers: [{ provide: UserRepository, useClass: PrismaUserRepository }, ResetUserDataService],
  exports: [UserRepository, ResetUserDataService],
})
export class UserModule {}
