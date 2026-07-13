import { Module } from '@nestjs/common';
import { AuditLogRepository } from './domain/audit-log.repository';
import { PrismaAuditLogRepository } from './infrastructure/prisma-audit-log.repository';

@Module({
  providers: [{ provide: AuditLogRepository, useClass: PrismaAuditLogRepository }],
  exports: [AuditLogRepository],
})
export class AuditModule {}
