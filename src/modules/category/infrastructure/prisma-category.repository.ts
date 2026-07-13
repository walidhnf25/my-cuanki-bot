import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { normalizeText } from 'src/shared/utils/string-normalizer';
import { TransactionType } from 'src/shared/domain/enums';
import {
  CategoryEntity,
  CreateCategoryInput,
  FindByKeywordOptions,
} from '../domain/category.entity';
import { CategoryRepository } from '../domain/category.repository';
import { toCategoryEntity } from './category.mapper';

@Injectable()
export class PrismaCategoryRepository extends CategoryRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string): Promise<CategoryEntity | null> {
    const row = await this.prisma.category.findUnique({ where: { id } });
    return row ? toCategoryEntity(row) : null;
  }

  async findByKeyword(
    keyword: string,
    options?: FindByKeywordOptions,
  ): Promise<CategoryEntity | null> {
    const normalized = normalizeText(keyword);

    const categoryWhere: Prisma.CategoryWhereInput = {
      // System categories, plus this user's own when provided.
      OR: [{ userId: null }, ...(options?.userId ? [{ userId: options.userId }] : [])],
      ...(options?.type ? { type: options.type } : {}),
    };

    const matches = await this.prisma.categoryKeyword.findMany({
      where: { keyword: normalized, category: categoryWhere },
      include: { category: true },
    });

    if (matches.length === 0) return null;

    // Prefer the user's own category over a system one.
    const preferred = matches.find((m) => m.category.userId !== null) ?? matches[0];
    return toCategoryEntity(preferred.category);
  }

  async findByNameAndType(
    name: string,
    type: TransactionType,
    userId: string | null = null,
  ): Promise<CategoryEntity | null> {
    const row = await this.prisma.category.findFirst({
      where: { name, type: type, userId },
    });
    return row ? toCategoryEntity(row) : null;
  }

  async findAllForUser(userId: string): Promise<CategoryEntity[]> {
    const rows = await this.prisma.category.findMany({
      where: { OR: [{ userId: null }, { userId }] },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return rows.map(toCategoryEntity);
  }

  async findSystem(): Promise<CategoryEntity[]> {
    const rows = await this.prisma.category.findMany({
      where: { userId: null },
      orderBy: { name: 'asc' },
    });
    return rows.map(toCategoryEntity);
  }

  async create(input: CreateCategoryInput): Promise<CategoryEntity> {
    const row = await this.prisma.category.create({
      data: {
        userId: input.userId ?? null,
        name: input.name,
        type: input.type,
        icon: input.icon ?? null,
        isSystem: input.isSystem ?? false,
      },
    });
    return toCategoryEntity(row);
  }
}
