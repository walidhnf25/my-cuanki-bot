import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { cellString, dateCell } from 'src/sheets/cells';
import { SheetsClient } from 'src/sheets/sheets.client';
import { SeedCategory, SYSTEM_CATEGORIES } from './seed-data';

/**
 * Deterministic id (e.g. `system-expense-pemasukan-lain`). Serverless cold
 * starts can seed concurrently and append the same category twice; a stable id
 * lets the repository collapse those duplicates instead of treating them as
 * distinct categories.
 */
export function systemCategoryId(category: Pick<SeedCategory, 'type' | 'name'>): string {
  const slug = category.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `system-${category.type.toLowerCase()}-${slug}`;
}

/**
 * Ensures the system categories exist on boot (idempotent) so automatic
 * categorization works out-of-the-box. Categories already in the sheet are
 * left untouched, so keywords edited by hand are preserved. Failures are
 * logged, never fatal to startup.
 */
@Injectable()
export class CategorySeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CategorySeederService.name);

  constructor(private readonly sheets: SheetsClient) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const rows = await this.sheets.getRows('categories');
      const existing = new Set(
        rows
          .filter((r) => cellString(r.data.user_id) === null)
          .map((r) => `${cellString(r.data.type)}|${cellString(r.data.name)}`),
      );

      const now = dateCell(new Date());
      const missing = SYSTEM_CATEGORIES.filter((c) => !existing.has(`${c.type}|${c.name}`));
      await this.sheets.append(
        'categories',
        missing.map((c) => ({
          id: systemCategoryId(c),
          user_id: null,
          name: c.name,
          type: c.type,
          icon: c.icon,
          is_system: true,
          keywords: c.keywords.join(', '),
          created_at: now,
        })),
      );

      if (missing.length > 0) {
        this.logger.log(`Seeded ${missing.length} system categories`);
      }
    } catch (err) {
      this.logger.error({ err }, 'Category seeding failed (non-fatal)');
    }
  }
}
