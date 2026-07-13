import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { TransactionType } from 'src/shared/domain/enums';
import {
  CategoryTotal,
  CreateTransactionInput,
  DateRange,
  TransactionEntity,
  TypedTotals,
  UpdateTransactionInput,
} from '../domain/transaction.entity';
import { FindManyOptions, TransactionRepository } from '../domain/transaction.repository';
import { decimalSumToMoney, toTransactionEntity } from './transaction.mapper';

@Injectable()
export class PrismaTransactionRepository extends TransactionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(input: CreateTransactionInput): Promise<TransactionEntity> {
    const row = await this.prisma.transaction.create({
      data: {
        userId: input.userId,
        categoryId: input.categoryId ?? null,
        type: input.type,
        amount: input.amount.toDecimalString(),
        description: input.description,
        note: input.note ?? null,
        occurredAt: input.occurredAt,
        sourceMessage: input.sourceMessage ?? null,
        waMessageId: input.waMessageId ?? null,
      },
    });
    return toTransactionEntity(row);
  }

  async findById(id: string): Promise<TransactionEntity | null> {
    const row = await this.prisma.transaction.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? toTransactionEntity(row) : null;
  }

  async findLatestForUser(userId: string): Promise<TransactionEntity | null> {
    const row = await this.prisma.transaction.findFirst({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return row ? toTransactionEntity(row) : null;
  }

  async findManyInRange(
    userId: string,
    range: DateRange,
    options?: FindManyOptions,
  ): Promise<TransactionEntity[]> {
    const rows = await this.prisma.transaction.findMany({
      where: {
        userId,
        deletedAt: null,
        occurredAt: { gte: range.start, lte: range.end },
        ...(options?.type ? { type: options.type } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      ...(options?.limit ? { take: options.limit } : {}),
    });
    return rows.map(toTransactionEntity);
  }

  async update(id: string, patch: UpdateTransactionInput): Promise<TransactionEntity> {
    const data: Prisma.TransactionUpdateInput = {
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.note !== undefined ? { note: patch.note } : {}),
      ...(patch.occurredAt !== undefined ? { occurredAt: patch.occurredAt } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.amount !== undefined ? { amount: patch.amount.toDecimalString() } : {}),
      ...(patch.categoryId !== undefined
        ? {
            category:
              patch.categoryId === null
                ? { disconnect: true }
                : { connect: { id: patch.categoryId } },
          }
        : {}),
    };

    const row = await this.prisma.transaction.update({ where: { id }, data });
    return toTransactionEntity(row);
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.transaction.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async existsByWaMessageId(waMessageId: string): Promise<boolean> {
    const found = await this.prisma.transaction.findUnique({
      where: { waMessageId },
      select: { id: true },
    });
    return found !== null;
  }

  async sumByType(userId: string, range: DateRange): Promise<TypedTotals> {
    const grouped = await this.prisma.transaction.groupBy({
      by: ['type'],
      where: {
        userId,
        deletedAt: null,
        occurredAt: { gte: range.start, lte: range.end },
      },
      _sum: { amount: true },
    });

    const totals: TypedTotals = {
      income: decimalSumToMoney(null),
      expense: decimalSumToMoney(null),
    };
    for (const g of grouped) {
      if ((g.type as TransactionType) === TransactionType.INCOME) {
        totals.income = decimalSumToMoney(g._sum.amount);
      } else {
        totals.expense = decimalSumToMoney(g._sum.amount);
      }
    }
    return totals;
  }

  async sumByCategory(
    userId: string,
    range: DateRange,
    type: TransactionType,
  ): Promise<CategoryTotal[]> {
    const grouped = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        deletedAt: null,
        type: type,
        occurredAt: { gte: range.start, lte: range.end },
      },
      _sum: { amount: true },
    });

    return grouped
      .map((g) => ({
        categoryId: g.categoryId,
        total: decimalSumToMoney(g._sum.amount),
      }))
      .sort((a, b) => b.total.compareTo(a.total));
  }
}
