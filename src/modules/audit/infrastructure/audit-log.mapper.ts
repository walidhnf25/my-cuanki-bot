import type { AuditLog as PrismaAuditLog } from '@prisma/client';
import { AuditLogEntity, AuditMetadata } from '../domain/audit-log.entity';

export function toAuditLogEntity(row: PrismaAuditLog): AuditLogEntity {
  return {
    id: row.id,
    userId: row.userId,
    action: row.action,
    metadata: (row.metadata as AuditMetadata | null) ?? null,
    createdAt: row.createdAt,
  };
}
