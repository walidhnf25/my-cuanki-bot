import { SummaryPeriod } from 'src/modules/parser/domain/parsed-intent';
import { CategoryRepository } from 'src/modules/category/domain/category.repository';
import { TransferEntity } from '../domain/transfer.entity';
import { TransferRepository } from '../domain/transfer.repository';
import { TransactionRepository } from 'src/modules/transaction/domain/transaction.repository';
import { UserEntity } from 'src/modules/user/domain/user.entity';
import { UserRepository } from 'src/modules/user/domain/user.repository';
import { Wallet, WalletMode } from 'src/shared/domain/enums';
import { Money } from 'src/shared/utils/money';
import { WalletService } from './wallet.service';

const zero = () => ({ income: Money.zero(), expense: Money.zero() });

function user(over: Partial<UserEntity> = {}): UserEntity {
  return {
    id: 'u1',
    telegramId: '1',
    chatId: '1',
    displayName: null,
    currency: 'IDR',
    timezone: 'Asia/Jakarta',
    isOnboarded: true,
    walletMode: null,
    defaultWallet: null,
    openingCash: null,
    openingDigital: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

describe('WalletService', () => {
  let transactions: jest.Mocked<TransactionRepository>;
  let users: jest.Mocked<UserRepository>;
  let categories: jest.Mocked<CategoryRepository>;
  let transfers: jest.Mocked<TransferRepository>;
  let service: WalletService;

  beforeEach(() => {
    transactions = {
      sumByWallet: jest.fn().mockResolvedValue({
        [Wallet.CASH]: { income: Money.fromMajor(500000), expense: Money.fromMajor(100000) },
        [Wallet.DIGITAL]: { income: Money.zero(), expense: Money.fromMajor(50000) },
      }),
      hasExplicitWallet: jest.fn().mockResolvedValue(false),
      sumByCategory: jest.fn().mockResolvedValue([]),
      hasTransactionsInWallet: jest.fn().mockResolvedValue(false),
      findByNote: jest.fn().mockResolvedValue([]),
      existsByMessageId: jest.fn().mockResolvedValue(false),
      softDelete: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockImplementation((input) => Promise.resolve({ id: 'new', ...input })),
    } as unknown as jest.Mocked<TransactionRepository>;
    categories = {
      findById: jest.fn().mockResolvedValue({ name: 'Makanan', icon: '🍜' }),
      findByNameAndType: jest.fn().mockResolvedValue({ id: 'system-income-saldo-awal' }),
    } as unknown as jest.Mocked<CategoryRepository>;
    users = {
      findById: jest.fn().mockResolvedValue(user()),
      update: jest.fn(),
    } as unknown as jest.Mocked<UserRepository>;
    transfers = {
      create: jest.fn(),
      findLatestForUser: jest.fn(),
      softDelete: jest.fn().mockResolvedValue(undefined),
      existsByMessageId: jest.fn().mockResolvedValue(false),
      findManyInRange: jest.fn().mockResolvedValue([]),
      sumByWallet: jest.fn().mockResolvedValue({
        [Wallet.CASH]: { in: Money.zero(), out: Money.zero() },
        [Wallet.DIGITAL]: { in: Money.zero(), out: Money.zero() },
      }),
      hasAny: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<TransferRepository>;
    service = new WalletService(transactions, users, categories, transfers);
  });

  it('computes balances per wallet including the opening balance', async () => {
    users.findById.mockResolvedValue(user({ openingDigital: Money.fromMajor(200000) }));
    const overview = await service.current('u1');

    const [cash, digital] = overview.lines;
    expect(cash.balance.toNumber()).toBe(400000);
    expect(digital.balance.toNumber()).toBe(150000);
    expect(overview.total.toNumber()).toBe(550000);
  });

  it('stays disabled for a user who never used wallets', async () => {
    expect((await service.current('u1')).enabled).toBe(false);
  });

  it('is enabled once the user chose a default wallet', async () => {
    users.findById.mockResolvedValue(user({ defaultWallet: Wallet.DIGITAL }));
    expect((await service.current('u1')).enabled).toBe(true);
  });

  it('is enabled once the user set an opening balance', async () => {
    users.findById.mockResolvedValue(user({ openingCash: Money.zero() }));
    expect((await service.current('u1')).enabled).toBe(true);
  });

  it('is enabled once the user has an explicit-wallet transaction', async () => {
    transactions.hasExplicitWallet.mockResolvedValue(true);
    expect((await service.current('u1')).enabled).toBe(true);
  });

  it('reports window income/expense and the balance as of the end of the window', async () => {
    transactions.sumByWallet
      .mockResolvedValueOnce({
        [Wallet.CASH]: { income: Money.fromMajor(1000), expense: Money.fromMajor(200) },
        [Wallet.DIGITAL]: zero(),
      })
      .mockResolvedValueOnce({
        [Wallet.CASH]: { income: Money.fromMajor(500000), expense: Money.fromMajor(100000) },
        [Wallet.DIGITAL]: zero(),
      });

    const overview = await service.overview(
      'u1',
      SummaryPeriod.Month,
      new Date('2026-07-15T03:00:00Z'),
      'Asia/Jakarta',
    );
    // First the window itself, then everything up to its end (from the beginning of time).
    expect(transactions.sumByWallet.mock.calls[0][1]).toBeDefined();
    expect(transactions.sumByWallet.mock.calls[1][1]?.start.getTime()).toBe(0);
    expect(overview.lines[0].income.toNumber()).toBe(1000);
    expect(overview.lines[0].balance.toNumber()).toBe(400000);
  });

  it('adds expense categories per wallet to the period overview', async () => {
    users.findById.mockResolvedValue(user({ defaultWallet: Wallet.CASH }));
    transactions.sumByCategory.mockImplementation((_u, _r, _t, wallet) =>
      Promise.resolve(
        wallet === Wallet.CASH ? [{ categoryId: 'cat-food', total: Money.fromMajor(75000) }] : [],
      ),
    );

    const overview = await service.overview(
      'u1',
      SummaryPeriod.Month,
      new Date('2026-07-15T03:00:00Z'),
      'Asia/Jakarta',
    );

    expect(transactions.sumByCategory).toHaveBeenCalledWith(
      'u1',
      expect.anything(),
      'EXPENSE',
      Wallet.DIGITAL,
    );
    expect(overview.lines[0].categories).toEqual([
      { name: 'Makanan', icon: '🍜', total: Money.fromMajor(75000) },
    ]);
    expect(overview.lines[1].categories).toEqual([]);
  });

  it('skips category lookups for users who have not used wallets', async () => {
    await service.overview('u1', SummaryPeriod.Month, new Date(), 'Asia/Jakarta');
    expect(transactions.sumByCategory).not.toHaveBeenCalled();
  });

  describe('start of period balance', () => {
    it('rewinds the current balance by the period movements so the ledger adds up', async () => {
      users.findById.mockResolvedValue(user({ openingCash: Money.fromMajor(34000) }));
      // Period (September): cash +50.000 -20.000; all time: +200.000 -80.000.
      transactions.sumByWallet.mockImplementation((_u, range) =>
        Promise.resolve(
          range && range.start.getTime() > 0
            ? {
                [Wallet.CASH]: { income: Money.fromMajor(50000), expense: Money.fromMajor(20000) },
                [Wallet.DIGITAL]: zero(),
              }
            : {
                [Wallet.CASH]: { income: Money.fromMajor(200000), expense: Money.fromMajor(80000) },
                [Wallet.DIGITAL]: zero(),
              },
        ),
      );
      // Transfers: period +30.000 -5.000; all time +40.000 -15.000.
      transfers.sumByWallet.mockImplementation((_u, range) =>
        Promise.resolve({
          [Wallet.CASH]:
            range && range.start.getTime() > 0
              ? { in: Money.fromMajor(30000), out: Money.fromMajor(5000) }
              : { in: Money.fromMajor(40000), out: Money.fromMajor(15000) },
          [Wallet.DIGITAL]: { in: Money.zero(), out: Money.zero() },
        }),
      );

      const overview = await service.overview(
        'u1',
        SummaryPeriod.Month,
        new Date('2026-09-15T03:00:00Z'),
        'Asia/Jakarta',
      );
      const cash = overview.lines[0];

      // 34.000 + 200.000 - 80.000 + 40.000 - 15.000
      expect(cash.balance.toNumber()).toBe(179000);
      // 179.000 - 50.000 + 20.000 - 30.000 + 5.000
      expect(cash.startBalance.toNumber()).toBe(124000);
      expect(
        cash.startBalance
          .add(cash.income)
          .subtract(cash.expense)
          .add(cash.transferIn)
          .subtract(cash.transferOut)
          .equals(cash.balance),
      ).toBe(true);
    });

    it('shows the balance as of the end of a past window, not the balance today', async () => {
      const augustEnd = new Date('2026-08-31T16:59:59.999Z'); // end of Aug in Jakarta
      transactions.sumByWallet.mockImplementation((_u, range) =>
        Promise.resolve(
          range && range.end.getTime() <= augustEnd.getTime()
            ? {
                [Wallet.CASH]: { income: Money.fromMajor(100000), expense: Money.zero() },
                [Wallet.DIGITAL]: zero(),
              }
            : {
                // September movements exist, but must not leak into an August view.
                [Wallet.CASH]: { income: Money.fromMajor(900000), expense: Money.zero() },
                [Wallet.DIGITAL]: zero(),
              },
        ),
      );

      const overview = await service.overview(
        'u1',
        SummaryPeriod.Month,
        new Date('2026-08-15T03:00:00Z'),
        'Asia/Jakarta',
      );

      const upToEnd = transactions.sumByWallet.mock.calls[1][1]!;
      expect(upToEnd.start.getTime()).toBe(0);
      expect(upToEnd.end.getTime()).toBe(augustEnd.getTime());
      expect(overview.lines[0].balance.toNumber()).toBe(100000);
      expect(overview.lines[0].startBalance.toNumber()).toBe(0);
    });

    it('equals the opening balance when every movement falls inside the period', async () => {
      users.findById.mockResolvedValue(user({ openingDigital: Money.fromMajor(522000) }));
      const same = {
        [Wallet.CASH]: zero(),
        [Wallet.DIGITAL]: { income: Money.zero(), expense: Money.fromMajor(20000) },
      };
      transactions.sumByWallet.mockResolvedValue(same);

      const overview = await service.overview(
        'u1',
        SummaryPeriod.Month,
        new Date('2026-09-15T03:00:00Z'),
        'Asia/Jakarta',
      );
      const digital = overview.lines[1];
      expect(digital.balance.toNumber()).toBe(502000);
      expect(digital.startBalance.toNumber()).toBe(522000);
    });

    it('is simply the opening balance for current()', async () => {
      users.findById.mockResolvedValue(user({ openingCash: Money.fromMajor(34000) }));
      const cash = (await service.current('u1')).lines[0];
      expect(cash.startBalance.toNumber()).toBe(34000);
    });
  });

  describe('wallet mode', () => {
    it('is off for a user who never chose or used wallets', async () => {
      const overview = await service.current('u1');
      expect(overview.mode).toBeNull();
      expect(overview.enabled).toBe(false);
      expect(overview.lines).toHaveLength(2);
    });

    it('treats a legacy user who used wallets as BOTH', async () => {
      users.findById.mockResolvedValue(user({ defaultWallet: Wallet.CASH }));
      expect((await service.current('u1')).mode).toBe(WalletMode.BOTH);
    });

    it('is on as soon as a mode is chosen, even with no wallet data', async () => {
      users.findById.mockResolvedValue(user({ walletMode: WalletMode.DIGITAL }));
      const overview = await service.current('u1');
      expect(overview.enabled).toBe(true);
      expect(overview.mode).toBe(WalletMode.DIGITAL);
    });

    it('only reports the active wallet in a one-wallet mode', async () => {
      users.findById.mockResolvedValue(user({ walletMode: WalletMode.CASH }));
      const overview = await service.current('u1');
      expect(overview.lines.map((l) => l.wallet)).toEqual([Wallet.CASH]);
      expect(overview.total.toNumber()).toBe(400000);
    });

    it('accepts any mode for a user without wallet data', async () => {
      expect(await service.setMode('u1', WalletMode.CASH)).toEqual({ ok: true });
      expect(users.update).toHaveBeenLastCalledWith('u1', {
        walletMode: WalletMode.CASH,
        defaultWallet: Wallet.CASH,
      });
      expect(await service.setMode('u1', WalletMode.DIGITAL)).toEqual({ ok: true });
      expect(users.update).toHaveBeenLastCalledWith('u1', {
        walletMode: WalletMode.DIGITAL,
        defaultWallet: Wallet.DIGITAL,
      });
      expect(await service.setMode('u1', WalletMode.BOTH)).toEqual({ ok: true });
    });

    it('refuses to turn off a wallet that has transactions', async () => {
      transactions.hasTransactionsInWallet.mockImplementation((_u, wallet) =>
        Promise.resolve(wallet === Wallet.DIGITAL),
      );
      expect(await service.setMode('u1', WalletMode.CASH)).toEqual({
        ok: false,
        blocked: Wallet.DIGITAL,
      });
      expect(users.update).not.toHaveBeenCalled();
    });

    it('refuses to turn off cash when legacy (blank-wallet) transactions exist', async () => {
      transactions.hasTransactionsInWallet.mockImplementation((_u, wallet) =>
        Promise.resolve(wallet === Wallet.CASH),
      );
      expect(await service.setMode('u1', WalletMode.DIGITAL)).toEqual({
        ok: false,
        blocked: Wallet.CASH,
      });
    });

    it('refuses to turn off a wallet with a non-zero opening balance or a transfer', async () => {
      users.findById.mockResolvedValue(user({ openingDigital: Money.fromMajor(1) }));
      expect((await service.setMode('u1', WalletMode.CASH)).ok).toBe(false);

      users.findById.mockResolvedValue(user());
      transfers.sumByWallet.mockResolvedValue({
        [Wallet.CASH]: { in: Money.zero(), out: Money.zero() },
        [Wallet.DIGITAL]: { in: Money.fromMajor(5), out: Money.zero() },
      });
      expect((await service.setMode('u1', WalletMode.CASH)).ok).toBe(false);
    });

    it('does not count a zero opening balance as data', async () => {
      users.findById.mockResolvedValue(user({ openingDigital: Money.zero() }));
      expect((await service.setMode('u1', WalletMode.CASH)).ok).toBe(true);
    });

    it('forgets a single-wallet default when going back to both, but keeps a real one', async () => {
      users.findById.mockResolvedValue(
        user({ walletMode: WalletMode.CASH, defaultWallet: Wallet.CASH }),
      );
      await service.setMode('u1', WalletMode.BOTH);
      expect(users.update).toHaveBeenLastCalledWith('u1', {
        walletMode: WalletMode.BOTH,
        defaultWallet: null,
      });

      users.findById.mockResolvedValue(
        user({ walletMode: WalletMode.BOTH, defaultWallet: Wallet.DIGITAL }),
      );
      await service.setMode('u1', WalletMode.BOTH);
      expect(users.update).toHaveBeenLastCalledWith('u1', {
        walletMode: WalletMode.BOTH,
        defaultWallet: Wallet.DIGITAL,
      });
    });
  });

  describe('transfers', () => {
    const entity = (over: Partial<TransferEntity> = {}): TransferEntity => ({
      id: 't1',
      userId: 'u1',
      from: Wallet.DIGITAL,
      to: Wallet.CASH,
      amount: Money.fromMajor(100000),
      note: null,
      occurredAt: new Date(),
      messageId: 'm1',
      deletedAt: null,
      createdAt: new Date(),
      ...over,
    });

    it('moves balance from the source to the destination wallet', async () => {
      transfers.sumByWallet.mockResolvedValue({
        [Wallet.CASH]: { in: Money.fromMajor(100000), out: Money.zero() },
        [Wallet.DIGITAL]: { in: Money.zero(), out: Money.fromMajor(100000) },
      });
      const overview = await service.current('u1');
      const [cash, digital] = overview.lines;
      expect(cash.balance.toNumber()).toBe(500000); // 400000 + 100000
      expect(digital.balance.toNumber()).toBe(-150000); // -50000 - 100000
      expect(overview.total.toNumber()).toBe(350000); // transfers never change the total
    });

    it('counts a transfer as wallet usage', async () => {
      transfers.hasAny.mockResolvedValue(true);
      expect((await service.current('u1')).enabled).toBe(true);
    });

    it('reports period transfers and their totals in overview()', async () => {
      users.findById.mockResolvedValue(user({ defaultWallet: Wallet.CASH }));
      transfers.findManyInRange.mockResolvedValue([entity()]);
      transfers.sumByWallet.mockResolvedValue({
        [Wallet.CASH]: { in: Money.fromMajor(100000), out: Money.zero() },
        [Wallet.DIGITAL]: { in: Money.zero(), out: Money.fromMajor(100000) },
      });

      const overview = await service.overview(
        'u1',
        SummaryPeriod.Month,
        new Date('2026-07-15T03:00:00Z'),
        'Asia/Jakarta',
      );
      expect(overview.transfers).toHaveLength(1);
      expect(overview.lines[0].transferIn.toNumber()).toBe(100000);
      expect(overview.lines[1].transferOut.toNumber()).toBe(100000);
    });

    it('records a transfer once per chat message', async () => {
      transfers.create.mockResolvedValue(entity());
      const now = new Date();
      const first = await service.transfer(
        'u1',
        Wallet.DIGITAL,
        Wallet.CASH,
        Money.fromMajor(100000),
        now,
        'm1',
      );
      expect(first).not.toBeNull();
      expect(transfers.create).toHaveBeenCalledWith({
        userId: 'u1',
        from: Wallet.DIGITAL,
        to: Wallet.CASH,
        amount: Money.fromMajor(100000),
        occurredAt: now,
        messageId: 'm1',
      });

      transfers.existsByMessageId.mockResolvedValue(true);
      const again = await service.transfer(
        'u1',
        Wallet.DIGITAL,
        Wallet.CASH,
        Money.fromMajor(100000),
        now,
        'm1',
      );
      expect(again).toBeNull();
      expect(transfers.create).toHaveBeenCalledTimes(1);
    });

    it('deletes the latest transfer, or returns null when there is none', async () => {
      transfers.findLatestForUser.mockResolvedValue(entity());
      expect((await service.deleteLastTransfer('u1'))?.id).toBe('t1');
      expect(transfers.softDelete).toHaveBeenCalledWith('t1');

      transfers.findLatestForUser.mockResolvedValue(null);
      expect(await service.deleteLastTransfer('u1')).toBeNull();
    });
  });

  it('clears wallet settings on reset', async () => {
    await service.clearSettings('u1');
    expect(users.update).toHaveBeenCalledWith('u1', {
      defaultWallet: null,
      openingCash: null,
      openingDigital: null,
    });
  });

  describe('opening balance as income', () => {
    const NOW = new Date('2026-09-29T03:00:00Z');
    const entry = (wallet: Wallet | null, id = 'old') =>
      ({ id, userId: 'u1', wallet, note: 'SALDO_AWAL' }) as never;

    it('records it as an income entry in the Saldo Awal category', async () => {
      await service.setOpeningBalance('u1', Wallet.CASH, Money.fromMajor(200000), NOW, 'm1');

      expect(transactions.create).toHaveBeenCalledWith({
        userId: 'u1',
        categoryId: 'system-income-saldo-awal',
        type: 'INCOME',
        amount: Money.fromMajor(200000),
        description: 'Saldo awal',
        note: 'SALDO_AWAL',
        occurredAt: NOW,
        messageId: 'm1',
        wallet: Wallet.CASH,
      });
    });

    it('still works when the category has not been seeded yet', async () => {
      categories.findByNameAndType.mockResolvedValue(null);
      await service.setOpeningBalance('u1', Wallet.DIGITAL, Money.fromMajor(1), NOW, null);
      expect(transactions.create).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: null, wallet: Wallet.DIGITAL }),
      );
    });

    it("replaces only that wallet's previous entry", async () => {
      transactions.findByNote.mockResolvedValue([
        entry(Wallet.CASH, 'cash-old'),
        entry(Wallet.DIGITAL, 'digital-old'),
        entry(null, 'legacy-blank-is-cash'),
      ]);
      await service.setOpeningBalance('u1', Wallet.CASH, Money.fromMajor(5), NOW, 'm2');

      expect(transactions.softDelete.mock.calls.map((c) => c[0])).toEqual([
        'cash-old',
        'legacy-blank-is-cash',
      ]);
      expect(transactions.create).toHaveBeenCalledTimes(1);
    });

    it('removes the entry without creating a new one when set to zero', async () => {
      transactions.findByNote.mockResolvedValue([entry(Wallet.CASH)]);
      const result = await service.setOpeningBalance('u1', Wallet.CASH, Money.zero(), NOW, 'm3');

      expect(result).toBeNull();
      expect(transactions.softDelete).toHaveBeenCalledWith('old');
      expect(transactions.create).not.toHaveBeenCalled();
    });

    it('drops a leftover value stored on the user row so nothing is counted twice', async () => {
      users.findById.mockResolvedValue(user({ openingCash: Money.fromMajor(34000) }));
      await service.setOpeningBalance('u1', Wallet.CASH, Money.fromMajor(50000), NOW, 'm4');
      expect(users.update).toHaveBeenCalledWith('u1', { openingCash: null });

      users.update.mockClear();
      await service.setOpeningBalance('u1', Wallet.DIGITAL, Money.fromMajor(1), NOW, 'm5');
      expect(users.update).not.toHaveBeenCalled(); // digital had nothing stored
    });
  });

  describe('converting legacy opening balances', () => {
    const NOW = new Date('2026-09-29T03:00:00Z');

    it('does nothing for a user without a stored opening balance', async () => {
      const u = user();
      expect(await service.migrateLegacyOpening(u, NOW)).toBe(u);
      expect(transactions.create).not.toHaveBeenCalled();
      expect(users.update).not.toHaveBeenCalled();
    });

    it('turns each stored balance into an income entry dated now, then clears the row', async () => {
      const cleared = user();
      users.update.mockResolvedValue(cleared);
      const u = user({
        openingCash: Money.fromMajor(34000),
        openingDigital: Money.fromMajor(522000),
      });

      expect(await service.migrateLegacyOpening(u, NOW)).toBe(cleared);

      expect(transactions.create).toHaveBeenCalledTimes(2);
      expect(transactions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: Money.fromMajor(34000),
          wallet: Wallet.CASH,
          note: 'SALDO_AWAL',
          occurredAt: NOW,
          messageId: 'opening-migration:u1:CASH',
        }),
      );
      expect(transactions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: Money.fromMajor(522000),
          wallet: Wallet.DIGITAL,
          messageId: 'opening-migration:u1:DIGITAL',
        }),
      );
      expect(users.update).toHaveBeenCalledWith('u1', { openingCash: null, openingDigital: null });
    });

    it('does not create a second entry when an earlier run already did', async () => {
      transactions.existsByMessageId.mockResolvedValue(true);
      users.update.mockResolvedValue(user());

      await service.migrateLegacyOpening(user({ openingCash: Money.fromMajor(34000) }), NOW);

      expect(transactions.create).not.toHaveBeenCalled();
      expect(users.update).toHaveBeenCalledWith('u1', { openingCash: null, openingDigital: null });
    });

    it('only clears a stored zero', async () => {
      users.update.mockResolvedValue(user());
      await service.migrateLegacyOpening(user({ openingDigital: Money.zero() }), NOW);
      expect(transactions.create).not.toHaveBeenCalled();
      expect(users.update).toHaveBeenCalledTimes(1);
    });

    it('leaves the balance unchanged: the entry replaces the stored value', async () => {
      // Before: 34.000 stored on the row. After: the same 34.000 as an income entry.
      transactions.sumByWallet.mockResolvedValue({
        [Wallet.CASH]: { income: Money.fromMajor(34000), expense: Money.zero() },
        [Wallet.DIGITAL]: zero(),
      });
      users.findById.mockResolvedValue(user({ walletMode: WalletMode.BOTH }));
      const after = (await service.current('u1')).lines[0].balance.toNumber();

      transactions.sumByWallet.mockResolvedValue({
        [Wallet.CASH]: zero(),
        [Wallet.DIGITAL]: zero(),
      });
      users.findById.mockResolvedValue(
        user({ walletMode: WalletMode.BOTH, openingCash: Money.fromMajor(34000) }),
      );
      const before = (await service.current('u1')).lines[0].balance.toNumber();

      expect(after).toBe(before);
    });
  });

  it('stores the default wallet on the user', async () => {
    await service.setDefault('u1', Wallet.DIGITAL);
    expect(users.update).toHaveBeenLastCalledWith('u1', { defaultWallet: Wallet.DIGITAL });
  });
});
