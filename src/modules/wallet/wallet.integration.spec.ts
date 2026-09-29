import { CategoryRepository } from 'src/modules/category/domain/category.repository';
import { SummaryPeriod } from 'src/modules/parser/domain/parsed-intent';
import { SheetsTransactionRepository } from 'src/modules/transaction/infrastructure/sheets-transaction.repository';
import { SheetsUserRepository } from 'src/modules/user/infrastructure/sheets-user.repository';
import { SheetsClient } from 'src/sheets/sheets.client';
import { SheetName, SheetRecord, SheetRow } from 'src/sheets/sheets.schema';
import { TransactionType, Wallet, WalletMode } from 'src/shared/domain/enums';
import { Money } from 'src/shared/utils/money';
import { WalletService } from './application/wallet.service';
import { SheetsTransferRepository } from './infrastructure/sheets-transfer.repository';

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

const NOW = new Date('2026-09-29T03:00:00.000Z'); // 29 Sep 2026, 10:00 WIB
const TZ = 'Asia/Jakarta';

/**
 * The real repositories over a fake spreadsheet, reproducing an account that still
 * keeps its opening balances on the user row (Cash 34.000, Digital 522.000) and has
 * one Digital expense of 20.000.
 */
describe('legacy opening balance conversion (end to end)', () => {
  let sheets: FakeSheetsClient;
  let transactions: SheetsTransactionRepository;
  let users: SheetsUserRepository;
  let service: WalletService;

  beforeEach(async () => {
    sheets = new FakeSheetsClient();
    const client = sheets as unknown as SheetsClient;
    transactions = new SheetsTransactionRepository(client);
    users = new SheetsUserRepository(client);
    const transfers = new SheetsTransferRepository(client);
    const categories = {
      findById: () => Promise.resolve(null),
      findByNameAndType: (name: string) =>
        Promise.resolve(name === 'Saldo Awal' ? { id: 'system-income-saldo-awal' } : null),
    } as unknown as CategoryRepository;
    service = new WalletService(transactions, users, categories, transfers);

    await sheets.append('users', [
      {
        id: 'u1',
        telegram_id: '1',
        chat_id: '1',
        currency: 'IDR',
        timezone: TZ,
        is_onboarded: true,
        wallet_mode: 'BOTH',
        opening_cash: 34000,
        opening_digital: 522000,
      },
    ]);
    await transactions.create({
      userId: 'u1',
      type: TransactionType.EXPENSE,
      amount: Money.fromMajor(20000),
      description: 'cincau',
      occurredAt: new Date('2026-09-20T03:00:00.000Z'),
      wallet: Wallet.DIGITAL,
    });
  });

  const september = () => service.overview('u1', SummaryPeriod.Month, NOW, TZ);
  const income = async () =>
    (
      await transactions.sumByType('u1', {
        start: new Date('2026-08-31T17:00:00.000Z'),
        end: new Date('2026-09-30T16:59:59.999Z'),
      })
    ).income.toNumber();

  it('shows the same balances before and after, but the money now counts as Masuk', async () => {
    const before = await september();
    expect(before.lines.map((l) => l.balance.toNumber())).toEqual([34000, 502000]);
    expect(before.total.toNumber()).toBe(536000);
    expect(before.lines.map((l) => l.income.toNumber())).toEqual([0, 0]); // the complaint
    expect(await income()).toBe(0);

    const user = (await users.findById('u1'))!;
    const converted = await service.migrateLegacyOpening(user, NOW);
    expect(converted.openingCash).toBeNull();
    expect(converted.openingDigital).toBeNull();

    const after = await september();
    expect(after.lines.map((l) => l.balance.toNumber())).toEqual([34000, 502000]);
    expect(after.total.toNumber()).toBe(536000);
    expect(after.lines.map((l) => l.income.toNumber())).toEqual([34000, 522000]);
    expect(after.lines.map((l) => l.expense.toNumber())).toEqual([0, 20000]);
    expect(await income()).toBe(556000);

    // Nothing carried in from before September, so no "Saldo sebelumnya" to show.
    expect(after.lines.every((l) => l.startBalance.isZero())).toBe(true);
    // And each ledger adds up.
    for (const l of after.lines) {
      expect(
        l.startBalance
          .add(l.income)
          .subtract(l.expense)
          .add(l.transferIn)
          .subtract(l.transferOut)
          .equals(l.balance),
      ).toBe(true);
    }
  });

  it('is safe to run twice: no second entry, balances unchanged', async () => {
    const user = (await users.findById('u1'))!;
    await service.migrateLegacyOpening(user, NOW);
    // A second message from a stale copy of the user (e.g. a concurrent request).
    await service.migrateLegacyOpening(user, NOW);

    const entries = await transactions.findByNote('u1', 'SALDO_AWAL');
    expect(entries).toHaveLength(2);
    expect((await september()).total.toNumber()).toBe(536000);
  });

  it('stores the entries as income in the right wallets with the Saldo Awal category', async () => {
    await service.migrateLegacyOpening((await users.findById('u1'))!, NOW);

    const entries = await transactions.findByNote('u1', 'SALDO_AWAL');
    const byWallet = Object.fromEntries(entries.map((e) => [e.wallet, e]));
    expect(byWallet[Wallet.CASH].amount.toNumber()).toBe(34000);
    expect(byWallet[Wallet.DIGITAL].amount.toNumber()).toBe(522000);
    for (const e of entries) {
      expect(e.type).toBe(TransactionType.INCOME);
      expect(e.categoryId).toBe('system-income-saldo-awal');
      expect(e.occurredAt.getTime()).toBe(NOW.getTime());
    }
  });

  it('a new "saldo awal" replaces the converted entry instead of adding to it', async () => {
    await service.migrateLegacyOpening((await users.findById('u1'))!, NOW);

    await service.setOpeningBalance('u1', Wallet.DIGITAL, Money.fromMajor(600000), NOW, 'm9');

    const overview = await september();
    expect(overview.lines[1].income.toNumber()).toBe(600000);
    expect(overview.lines[1].balance.toNumber()).toBe(580000);
    expect(await transactions.findByNote('u1', 'SALDO_AWAL')).toHaveLength(2);
  });

  it('a later month carries the balance in as "Saldo sebelumnya"', async () => {
    await service.migrateLegacyOpening((await users.findById('u1'))!, NOW);

    const october = await service.overview(
      'u1',
      SummaryPeriod.Month,
      new Date('2026-10-15T03:00:00.000Z'),
      TZ,
    );
    expect(october.lines.map((l) => l.startBalance.toNumber())).toEqual([34000, 502000]);
    expect(october.lines.map((l) => l.income.toNumber())).toEqual([0, 0]);
    expect(october.lines.map((l) => l.balance.toNumber())).toEqual([34000, 502000]);
  });

  it('keeps a wallet mode chosen by the user', async () => {
    const converted = await service.migrateLegacyOpening((await users.findById('u1'))!, NOW);
    expect(converted.walletMode).toBe(WalletMode.BOTH);
  });
});
