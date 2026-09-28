import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { cellBoolean, cellDate, cellRequiredString, cellString, dateCell } from 'src/sheets/cells';
import { SheetsClient } from 'src/sheets/sheets.client';
import { SheetRecord } from 'src/sheets/sheets.schema';
import { TransactionType } from 'src/shared/domain/enums';
import { normalizeText } from 'src/shared/utils/string-normalizer';
import {
  CategoryEntity,
  CreateCategoryInput,
  FindByKeywordOptions,
} from '../domain/category.entity';
import { CategoryRepository } from '../domain/category.repository';

const SHEET = 'categories';

interface CategoryRow {
  category: CategoryEntity;
  /** Normalized keywords from the comma-separated `keywords` column. */
  keywords: string[];
}

function toCategoryRow(data: SheetRecord): CategoryRow {
  return {
    category: {
      id: cellRequiredString(data.id),
      userId: cellString(data.user_id),
      name: cellRequiredString(data.name),
      type: cellRequiredString(data.type) as TransactionType,
      icon: cellString(data.icon),
      isSystem: cellBoolean(data.is_system),
      createdAt: cellDate(data.created_at) ?? new Date(0),
    },
    keywords: (cellString(data.keywords) ?? '')
      .split(',')
      .map(normalizeText)
      .filter((k) => k.length > 0),
  };
}

/**
 * Categories and their keyword mappings live in one tab; keywords are a
 * comma-separated column so they can be edited directly in the spreadsheet.
 */
@Injectable()
export class SheetsCategoryRepository extends CategoryRepository {
  constructor(private readonly sheets: SheetsClient) {
    super();
  }

  async findById(id: string): Promise<CategoryEntity | null> {
    return (await this.all()).find((r) => r.category.id === id)?.category ?? null;
  }

  async findByKeyword(
    keyword: string,
    options?: FindByKeywordOptions,
  ): Promise<CategoryEntity | null> {
    const normalized = normalizeText(keyword);
    const matches = (await this.all()).filter(
      ({ category, keywords }) =>
        // System categories, plus this user's own when provided.
        (category.userId === null || (!!options?.userId && category.userId === options.userId)) &&
        (!options?.type || category.type === options.type) &&
        keywords.includes(normalized),
    );
    if (matches.length === 0) return null;

    // Prefer the user's own category over a system one.
    return (matches.find((m) => m.category.userId !== null) ?? matches[0]).category;
  }

  async findByNameAndType(
    name: string,
    type: TransactionType,
    userId: string | null = null,
  ): Promise<CategoryEntity | null> {
    const match = (await this.all()).find(
      ({ category }) =>
        category.name === name && category.type === type && category.userId === userId,
    );
    return match?.category ?? null;
  }

  async findAllForUser(userId: string): Promise<CategoryEntity[]> {
    return (await this.all())
      .map((r) => r.category)
      .filter((c) => c.userId === null || c.userId === userId)
      .sort((a, b) => Number(b.isSystem) - Number(a.isSystem) || a.name.localeCompare(b.name));
  }

  async findSystem(): Promise<CategoryEntity[]> {
    return (await this.all())
      .map((r) => r.category)
      .filter((c) => c.userId === null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(input: CreateCategoryInput): Promise<CategoryEntity> {
    const category: CategoryEntity = {
      id: randomUUID(),
      userId: input.userId ?? null,
      name: input.name,
      type: input.type,
      icon: input.icon ?? null,
      isSystem: input.isSystem ?? false,
      createdAt: new Date(),
    };
    await this.sheets.append(SHEET, [
      {
        id: category.id,
        user_id: category.userId,
        name: category.name,
        type: category.type,
        icon: category.icon,
        is_system: category.isSystem,
        keywords: '',
        created_at: dateCell(category.createdAt),
      },
    ]);
    return category;
  }

  /** All categories; rows repeating an id (concurrent seeding) keep the first one. */
  private async all(): Promise<CategoryRow[]> {
    const seen = new Set<string>();
    return (await this.sheets.getRows(SHEET))
      .map((r) => toCategoryRow(r.data))
      .filter(({ category }) => !seen.has(category.id) && !!seen.add(category.id));
  }
}
