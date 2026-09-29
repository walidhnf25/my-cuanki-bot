import { Injectable } from '@nestjs/common';
import { CategoryRepository } from 'src/modules/category/domain/category.repository';
import { customRangeInfo, resolvePeriod } from 'src/modules/report/application/period';
import { CategoryBreakdown } from 'src/modules/report/domain/summary.types';
import { DateRangeSpec, SummaryPeriod } from 'src/modules/parser/domain/parsed-intent';
import { TransactionRepository } from 'src/modules/transaction/domain/transaction.repository';
import { UserEntity } from 'src/modules/user/domain/user.entity';
import { UserRepository } from 'src/modules/user/domain/user.repository';
import { TransactionType, Wallet } from 'src/shared/domain/enums';
import { Money } from 'src/shared/utils/money';

export interface WalletLine {
  wallet: Wallet;
  /** Money in / out over the reported window (all time for {@link WalletService.current}). */
  income: Money;
  expense: Money;
  /** Current balance: opening balance + all-time income - all-time expense. */
  balance: Money;
  /** Expense per category over the reported window, largest first (empty for current()). */
  categories: CategoryBreakdown[];
}

export interface WalletOverview {
  /** True once the user has used wallets; reports only show wallet detail then. */
  enabled: boolean;
  lines: WalletLine[];
  total: Money;
}

const WALLETS = [Wallet.CASH, Wallet.DIGITAL] as const;

function opening(user: UserEntity, wallet: Wallet): Money | null {
  return wallet === Wallet.CASH ? user.openingCash : user.openingDigital;
}

/** Wallet balances, the default wallet and opening balances of a user. */
@Injectable()
export class WalletService {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly users: UserRepository,
    private readonly categories: CategoryRepository,
  ) {}

  /** Per-wallet income/expense for a report period, plus current balances. */
  async overview(
    userId: string,
    period: SummaryPeriod,
    now: Date,
    tz: string,
    customRange?: DateRangeSpec,
  ): Promise<WalletOverview> {
    const { range } = customRange
      ? customRangeInfo(customRange, tz)
      : resolvePeriod(period, now, tz);
    const overview = await this.build(userId, await this.transactions.sumByWallet(userId, range));
    if (!overview.enabled) return overview;

    const lines = await Promise.all(
      overview.lines.map(async (line) => ({
        ...line,
        categories: await this.expenseCategories(userId, range, line.wallet),
      })),
    );
    return { ...overview, lines };
  }

  private async expenseCategories(
    userId: string,
    range: { start: Date; end: Date },
    wallet: Wallet,
  ): Promise<CategoryBreakdown[]> {
    const totals = await this.transactions.sumByCategory(
      userId,
      range,
      TransactionType.EXPENSE,
      wallet,
    );
    return Promise.all(
      totals.map(async (t) => {
        const category = t.categoryId ? await this.categories.findById(t.categoryId) : null;
        return {
          name: category?.name ?? 'Tanpa kategori',
          icon: category?.icon ?? '📦',
          total: t.total,
        };
      }),
    );
  }

  /** Current balances (all time). */
  async current(userId: string): Promise<WalletOverview> {
    return this.build(userId);
  }

  async setOpeningBalance(userId: string, wallet: Wallet, amount: Money): Promise<UserEntity> {
    return this.users.update(
      userId,
      wallet === Wallet.CASH ? { openingCash: amount } : { openingDigital: amount },
    );
  }

  async setDefault(userId: string, wallet: Wallet): Promise<UserEntity> {
    return this.users.update(userId, { defaultWallet: wallet });
  }

  /** Forget the default wallet and opening balances (used when a user resets their data). */
  async clearSettings(userId: string): Promise<void> {
    await this.users.update(userId, {
      defaultWallet: null,
      openingCash: null,
      openingDigital: null,
    });
  }

  private async build(
    userId: string,
    windowTotals?: Awaited<ReturnType<TransactionRepository['sumByWallet']>>,
  ): Promise<WalletOverview> {
    const user = await this.users.findById(userId);
    const allTime = await this.transactions.sumByWallet(userId);
    const shown = windowTotals ?? allTime;

    const lines: WalletLine[] = WALLETS.map((wallet) => ({
      wallet,
      income: shown[wallet].income,
      expense: shown[wallet].expense,
      categories: [],
      balance: (user ? (opening(user, wallet) ?? Money.zero()) : Money.zero())
        .add(allTime[wallet].income)
        .subtract(allTime[wallet].expense),
    }));

    const enabled = user
      ? user.defaultWallet !== null ||
        user.openingCash !== null ||
        user.openingDigital !== null ||
        (await this.transactions.hasExplicitWallet(userId))
      : false;

    return {
      enabled,
      lines,
      total: lines.reduce((sum, l) => sum.add(l.balance), Money.zero()),
    };
  }
}
