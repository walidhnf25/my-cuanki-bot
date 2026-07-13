import type { Category as PrismaCategory } from '@prisma/client';
import { TransactionType } from 'src/shared/domain/enums';
import { CategoryEntity } from '../domain/category.entity';

export function toCategoryEntity(row: PrismaCategory): CategoryEntity {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    type: row.type as TransactionType,
    icon: row.icon,
    isSystem: row.isSystem,
    createdAt: row.createdAt,
  };
}
