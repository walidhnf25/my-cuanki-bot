import { Module } from '@nestjs/common';
import { UserRepository } from './domain/user.repository';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository';

/**
 * User persistence module. Binds the UserRepository port to its Prisma
 * implementation and exports the port for other modules (services land in
 * Phase 7).
 */
@Module({
  providers: [{ provide: UserRepository, useClass: PrismaUserRepository }],
  exports: [UserRepository],
})
export class UserModule {}
