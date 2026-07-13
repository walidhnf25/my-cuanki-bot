import type { Prisma, Transaction as PrismaTransaction } from '@prisma/client';
import { TransactionType } from 'src/shared/domain/enums';
import { Money } from 'src/shared/utils/money';
import { TransactionEntity } from '../domain/transaction.entity';

export function toTransactionEntity(row: PrismaTransaction): TransactionEntity {
  return {
    id: row.id,
    userId: row.userId,
    categoryId: row.categoryId,
    type: row.type as TransactionType,
    amount: Money.fromMajor(row.amount.toString()),
    description: row.description,
    note: row.note,
    occurredAt: row.occurredAt,
    sourceMessage: row.sourceMessage,
    waMessageId: row.waMessageId,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Convert a Prisma Decimal aggregate (possibly null) into Money. */
export function decimalSumToMoney(sum: Prisma.Decimal | null): Money {
  return sum === null ? Money.zero() : Money.fromMajor(sum.toString());
}
