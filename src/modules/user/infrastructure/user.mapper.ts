import type { User as PrismaUser } from '@prisma/client';
import { UserEntity } from '../domain/user.entity';

export function toUserEntity(row: PrismaUser): UserEntity {
  return {
    id: row.id,
    waNumber: row.waNumber,
    displayName: row.displayName,
    currency: row.currency,
    timezone: row.timezone,
    isOnboarded: row.isOnboarded,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
