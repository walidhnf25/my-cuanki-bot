import { Module } from '@nestjs/common';
import { AuditLogRepository } from './domain/audit-log.repository';
import { LoggerAuditLogRepository } from './infrastructure/logger-audit-log.repository';

@Module({
  providers: [{ provide: AuditLogRepository, useClass: LoggerAuditLogRepository }],
  exports: [AuditLogRepository],
})
export class AuditModule {}
