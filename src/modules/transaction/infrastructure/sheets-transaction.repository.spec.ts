import { SheetsClient } from 'src/sheets/sheets.client';
import { SheetName, SheetRecord, SheetRow } from 'src/sheets/sheets.schema';
import { TransactionType } from 'src/shared/domain/enums';
import { Money } from 'src/shared/utils/money';
import { SheetsTransactionRepository } from './sheets-transaction.repository';

/** In-memory stand-in for the Sheets API: rows keep their spreadsheet numbering. */
class FakeSheetsClient {
  readonly tabs = new Map<SheetName, SheetRow[]>();

  getRows(sheet: SheetName): Promise<SheetRow[]> {
    return Promise.resolve([...(this.tabs.get(sheet) ?? [])]);
  }

  append(sheet: SheetName, records: SheetRecord[]): Promise<void> {
    const rows = this.tabs.get(sheet) ?? [];
    for (const data of records) rows.push({ rowNumber: rows.length + 2, data: { ...data } });
    this.tabs.set(sheet, rows);
    return Promise.resolve();
  }

  update(sheet: SheetName, rowNumber: number, record: SheetRecord): Promise<void> {
    const row = this.tabs.get(sheet)?.find((r) => r.rowNumber === rowNumber);
    if (row) row.data = { ...record };
    return Promise.resolve();
  }
}

const range = {
  start: new Date('2026-09-01T00:00:00Z'),
  end: new Date('2026-09-30T23:59:59Z'),
};

describe('SheetsTransactionRepository', () => {
  let sheets: FakeSheetsClient;
  let repo: SheetsTransactionRepository;

  const create = (overrides: Partial<Parameters<SheetsTransactionRepository['create']>[0]> = {}) =>
    repo.create({
      userId: 'u1',
      categoryId: 'cat-food',
      type: TransactionType.EXPENSE,
      amount: Money.fromMajor(25000),
      description: 'kopi',
      occurredAt: new Date('2026-09-10T03:00:00Z'),
      messageId: null,
      ...overrides,
    });

  beforeEach(() => {
    sheets = new FakeSheetsClient();
    repo = new SheetsTransactionRepository(sheets as unknown as SheetsClient);
  });

  it('stores the amount as a plain number and reads the entity back', async () => {
    const created = await create({ messageId: '1:1' });
    expect(sheets.tabs.get('transactions')?.[0].data.amount).toBe(25000);

    const found = await repo.findById(created.id);
    expect(found?.amount.equals(Money.fromMajor(25000))).toBe(true);
    expect(found?.occurredAt.toISOString()).toBe('2026-09-10T03:00:00.000Z');
    expect(await repo.existsByMessageId('1:1')).toBe(true);
    expect(await repo.existsByMessageId('1:2')).toBe(false);
  });

  it('sums by type and by category within the range, excluding deleted and other users', async () => {
    await create({ amount: Money.fromMajor(25000) });
    await create({ amount: Money.fromMajor(15000) });
    await create({ categoryId: 'cat-fuel', amount: Money.fromMajor(100000) });
    await create({
      type: TransactionType.INCOME,
      categoryId: 'cat-salary',
      amount: Money.fromMajor(8_000_000),
    });
    await create({ userId: 'u2', amount: Money.fromMajor(999) });
    await create({ occurredAt: new Date('2026-08-31T10:00:00Z'), amount: Money.fromMajor(777) });
    const deleted = await create({ amount: Money.fromMajor(5000) });
    await repo.softDelete(deleted.id);

    const totals = await repo.sumByType('u1', range);
    expect(totals.expense.equals(Money.fromMajor(140000))).toBe(true);
    expect(totals.income.equals(Money.fromMajor(8_000_000))).toBe(true);

    const byCategory = await repo.sumByCategory('u1', range, TransactionType.EXPENSE);
    expect(byCategory.map((c) => [c.categoryId, c.total.toNumber()])).toEqual([
      ['cat-fuel', 100000],
      ['cat-food', 40000],
    ]);
  });

  it('finds the latest non-deleted transaction and edits it in place', async () => {
    await create({ description: 'pertama' });
    const second = await create({ description: 'kedua' });
    expect((await repo.findLatestForUser('u1'))?.id).toBe(second.id);

    await repo.update(second.id, { amount: Money.fromMajor(30000) });
    expect((await repo.findById(second.id))?.amount.toNumber()).toBe(30000);
    expect(sheets.tabs.get('transactions')).toHaveLength(2);

    await repo.softDelete(second.id);
    expect((await repo.findLatestForUser('u1'))?.description).toBe('pertama');
  });

  it('returns range results newest first and honours the limit', async () => {
    await create({ description: 'a', occurredAt: new Date('2026-09-05T00:00:00Z') });
    await create({ description: 'b', occurredAt: new Date('2026-09-20T00:00:00Z') });
    await create({ description: 'c', occurredAt: new Date('2026-09-12T00:00:00Z') });

    const rows = await repo.findManyInRange('u1', range, { limit: 2 });
    expect(rows.map((t) => t.description)).toEqual(['b', 'c']);
  });
});
