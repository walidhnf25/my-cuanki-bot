import { SheetsClient } from 'src/sheets/sheets.client';
import { SheetName, SheetRecord, SheetRow } from 'src/sheets/sheets.schema';
import { Wallet } from 'src/shared/domain/enums';
import { Money } from 'src/shared/utils/money';
import { CreateTransferInput } from '../domain/transfer.entity';
import { SheetsTransferRepository } from './sheets-transfer.repository';

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

describe('SheetsTransferRepository', () => {
  let sheets: FakeSheetsClient;
  let repo: SheetsTransferRepository;

  const create = (over: Partial<CreateTransferInput> = {}) =>
    repo.create({
      userId: 'u1',
      from: Wallet.DIGITAL,
      to: Wallet.CASH,
      amount: Money.fromMajor(100000),
      occurredAt: new Date('2026-09-10T03:00:00Z'),
      ...over,
    });

  beforeEach(() => {
    sheets = new FakeSheetsClient();
    repo = new SheetsTransferRepository(sheets as unknown as SheetsClient);
  });

  it('stores wallets and a plain numeric amount', async () => {
    const t = await create({ messageId: 'm1' });
    const stored = sheets.tabs.get('transfers')![0].data;

    expect(stored.from_wallet).toBe('DIGITAL');
    expect(stored.to_wallet).toBe('CASH');
    expect(stored.amount).toBe(100000);
    expect(stored.message_id).toBe('m1');
    expect(t.amount.toNumber()).toBe(100000);
  });

  it('sums money received and sent per wallet, all time or within a range', async () => {
    await create({ amount: Money.fromMajor(100000) });
    await create({ from: Wallet.CASH, to: Wallet.DIGITAL, amount: Money.fromMajor(30000) });
    await create({ occurredAt: new Date('2026-08-01T00:00:00Z'), amount: Money.fromMajor(5000) });
    await create({ userId: 'u2', amount: Money.fromMajor(999) });

    const inRange = await repo.sumByWallet('u1', range);
    expect(inRange[Wallet.CASH].in.toNumber()).toBe(100000);
    expect(inRange[Wallet.CASH].out.toNumber()).toBe(30000);
    expect(inRange[Wallet.DIGITAL].in.toNumber()).toBe(30000);
    expect(inRange[Wallet.DIGITAL].out.toNumber()).toBe(100000);

    const allTime = await repo.sumByWallet('u1');
    expect(allTime[Wallet.CASH].in.toNumber()).toBe(105000);
  });

  it('lists range transfers oldest first and ignores other users', async () => {
    await create({ occurredAt: new Date('2026-09-20T00:00:00Z'), messageId: 'later' });
    await create({ occurredAt: new Date('2026-09-05T00:00:00Z'), messageId: 'earlier' });
    await create({ userId: 'u2' });

    const rows = await repo.findManyInRange('u1', range);
    expect(rows.map((r) => r.messageId)).toEqual(['earlier', 'later']);
  });

  it('finds and soft-deletes the latest transfer', async () => {
    const first = await create({ messageId: 'a' });
    const second = await create({ messageId: 'b' });
    expect((await repo.findLatestForUser('u1'))?.id).toBe(second.id);

    await repo.softDelete(second.id);
    expect((await repo.findLatestForUser('u1'))?.id).toBe(first.id);
    expect((await repo.sumByWallet('u1'))[Wallet.CASH].in.toNumber()).toBe(100000);
    await expect(repo.softDelete(second.id)).rejects.toThrow('not found');
  });

  it('detects duplicates by message id and any usage per user', async () => {
    await create({ messageId: 'm1' });
    expect(await repo.existsByMessageId('m1')).toBe(true);
    expect(await repo.existsByMessageId('other')).toBe(false);
    expect(await repo.hasAny('u1')).toBe(true);
    expect(await repo.hasAny('u2')).toBe(false);
  });
});
