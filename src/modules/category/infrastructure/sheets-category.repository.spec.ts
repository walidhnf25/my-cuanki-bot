import { SheetsClient } from 'src/sheets/sheets.client';
import { SheetRecord, SheetRow } from 'src/sheets/sheets.schema';
import { TransactionType } from 'src/shared/domain/enums';
import { systemCategoryId } from '../category-seeder.service';
import { SheetsCategoryRepository } from './sheets-category.repository';

const food = { name: 'Makanan', type: TransactionType.EXPENSE };

function row(rowNumber: number, data: SheetRecord): SheetRow {
  return { rowNumber, data };
}

describe('SheetsCategoryRepository', () => {
  it('collapses rows that repeat an id (concurrent seeding) to the first one', async () => {
    const id = systemCategoryId(food);
    const rows = [
      row(2, {
        id,
        user_id: null,
        name: 'Makanan',
        type: 'EXPENSE',
        is_system: true,
        keywords: 'kopi, makan',
      }),
      row(3, {
        id,
        user_id: null,
        name: 'Makanan',
        type: 'EXPENSE',
        is_system: true,
        keywords: 'kopi, makan',
      }),
      row(4, { id: 'u-1', user_id: 'user-1', name: 'Kopi', type: 'EXPENSE', keywords: 'kopi' }),
    ];
    const sheets = { getRows: jest.fn().mockResolvedValue(rows) };
    const repo = new SheetsCategoryRepository(sheets as unknown as SheetsClient);

    expect(await repo.findSystem()).toHaveLength(1);
    expect((await repo.findAllForUser('user-1')).map((c) => c.name)).toEqual(['Makanan', 'Kopi']);
    // The user's own category wins over the system one for a shared keyword.
    expect((await repo.findByKeyword('Kopi', { userId: 'user-1' }))?.id).toBe('u-1');
    expect((await repo.findByKeyword('kopi'))?.id).toBe(id);
  });

  it('derives stable system category ids', () => {
    expect(systemCategoryId(food)).toBe('system-expense-makanan');
    expect(systemCategoryId({ name: 'Pemasukan Lain', type: TransactionType.INCOME })).toBe(
      'system-income-pemasukan-lain',
    );
  });
});
