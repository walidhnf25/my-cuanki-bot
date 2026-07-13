import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { AuditLogEntity, RecordAuditInput } from '../domain/audit-log.entity';
import { AuditLogRepository } from '../domain/audit-log.repository';
import { toAuditLogEntity } from './audit-log.mapper';

@Injectable()
export class PrismaAuditLogRepository extends AuditLogRepository {
  private readonly logger = new Logger(PrismaAuditLogRepository.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async record(input: RecordAuditInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: input.userId ?? null,
          action: input.action,
          metadata:
            input.metadata === null || input.metadata === undefined
              ? Prisma.JsonNull
              : (input.metadata as Prisma.InputJsonValue),
        },
      });
    } catch (error) {
      // Audit logging is best-effort — never break the main flow because of it.
      this.logger.warn({ err: error, action: input.action }, 'Failed to write audit log');
    }
  }

  async findForUser(userId: string, limit = 50): Promise<AuditLogEntity[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(toAuditLogEntity);
  }
}
