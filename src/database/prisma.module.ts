import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global database module. PrismaService is provided app-wide so repositories
 * (Phase 4) can inject it without re-importing this module everywhere.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
