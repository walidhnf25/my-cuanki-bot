import { SummaryPeriod } from 'src/modules/parser/domain/parsed-intent';
import { CategoryRepository } from 'src/modules/category/domain/category.repository';
import { TransactionRepository } from 'src/modules/transaction/domain/transaction.repository';
import { UserEntity } from 'src/modules/user/domain/user.entity';
import { UserRepository } from 'src/modules/user/domain/user.repository';
import { Wallet } from 'src/shared/domain/enums';
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
  let service: WalletService;

  beforeEach(() => {
    transactions = {
      sumByWallet: jest.fn().mockResolvedValue({
        [Wallet.CASH]: { income: Money.fromMajor(500000), expense: Money.fromMajor(100000) },
        [Wallet.DIGITAL]: { income: Money.zero(), expense: Money.fromMajor(50000) },
      }),
      hasExplicitWallet: jest.fn().mockResolvedValue(false),
      sumByCategory: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<TransactionRepository>;
    categories = {
      findById: jest.fn().mockResolvedValue({ name: 'Makanan', icon: '🍜' }),
    } as unknown as jest.Mocked<CategoryRepository>;
    users = {
      findById: jest.fn().mockResolvedValue(user()),
      update: jest.fn(),
    } as unknown as jest.Mocked<UserRepository>;
    service = new WalletService(transactions, users, categories);
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
