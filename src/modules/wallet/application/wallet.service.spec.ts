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
    } as unknown as jest.Mocked<TransactionRepository>;
    categories = {
      findById: jest.fn().mockResolvedValue({ name: 'Makanan', icon: '🍜' }),
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

  it('reports period income/expense but all-time balances in overview()', async () => {
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
    expect(transactions.sumByWallet.mock.calls[0][1]).toBeDefined();
    expect(transactions.sumByWallet.mock.calls[1][1]).toBeUndefined();
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

  it('stores opening balance and default wallet on the user', async () => {
    await service.setOpeningBalance('u1', Wallet.CASH, Money.fromMajor(200000));
    expect(users.update).toHaveBeenCalledWith('u1', { openingCash: Money.fromMajor(200000) });
    await service.setOpeningBalance('u1', Wallet.DIGITAL, Money.fromMajor(1));
    expect(users.update).toHaveBeenLastCalledWith('u1', { openingDigital: Money.fromMajor(1) });
    await service.setDefault('u1', Wallet.DIGITAL);
    expect(users.update).toHaveBeenLastCalledWith('u1', { defaultWallet: Wallet.DIGITAL });
  });
});
