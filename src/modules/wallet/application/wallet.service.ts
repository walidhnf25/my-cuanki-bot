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
import { TransferEntity } from '../domain/transfer.entity';
import { TransferRepository } from '../domain/transfer.repository';

export interface WalletLine {
  wallet: Wallet;
  /** Money in / out over the reported window (all time for {@link WalletService.current}). */
  income: Money;
  expense: Money;
  /** Transfers received / sent over the reported window. */
  transferIn: Money;
  transferOut: Money;
  /** Current balance: opening + all-time income - expense + transfers in - transfers out. */
  balance: Money;
  /** Expense per category over the reported window, largest first (empty for current()). */
  categories: CategoryBreakdown[];
}

export interface WalletOverview {
  /** True once the user has used wallets; reports only show wallet detail then. */
  enabled: boolean;
  lines: WalletLine[];
  total: Money;
  /** Transfers inside the reported period, oldest first (empty for current()). */
  transfers: TransferEntity[];
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
    private readonly transfers: TransferRepository,
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
    const overview = await this.build(userId, range);
    if (!overview.enabled) return overview;

    const lines = await Promise.all(
      overview.lines.map(async (line) => ({
        ...line,
        categories: await this.expenseCategories(userId, range, line.wallet),
      })),
    );
    return {
      ...overview,
      lines,
      transfers: await this.transfers.findManyInRange(userId, range),
    };
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

  /** Move money between wallets. Returns null when this chat message was already recorded. */
  async transfer(
    userId: string,
    from: Wallet,
    to: Wallet,
    amount: Money,
    occurredAt: Date,
    messageId: string | null,
  ): Promise<TransferEntity | null> {
    if (messageId && (await this.transfers.existsByMessageId(messageId))) return null;
    return this.transfers.create({ userId, from, to, amount, occurredAt, messageId });
  }

  getLastTransfer(userId: string): Promise<TransferEntity | null> {
    return this.transfers.findLatestForUser(userId);
  }

  /** Soft-delete the user's most recent transfer. */
  async deleteLastTransfer(userId: string): Promise<TransferEntity | null> {
    const latest = await this.transfers.findLatestForUser(userId);
    if (!latest) return null;
    await this.transfers.softDelete(latest.id);
    return latest;
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

  private async build(userId: string, range?: { start: Date; end: Date }): Promise<WalletOverview> {
    const user = await this.users.findById(userId);
    const windowTotals = range ? await this.transactions.sumByWallet(userId, range) : undefined;
    const allTime = await this.transactions.sumByWallet(userId);
    const shown = windowTotals ?? allTime;
    const moved = await this.transfers.sumByWallet(userId);
    const movedShown = range ? await this.transfers.sumByWallet(userId, range) : moved;

    const lines: WalletLine[] = WALLETS.map((wallet) => ({
      wallet,
      income: shown[wallet].income,
      expense: shown[wallet].expense,
      transferIn: movedShown[wallet].in,
      transferOut: movedShown[wallet].out,
      categories: [],
      balance: (user ? (opening(user, wallet) ?? Money.zero()) : Money.zero())
        .add(allTime[wallet].income)
        .subtract(allTime[wallet].expense)
        .add(moved[wallet].in)
        .subtract(moved[wallet].out),
    }));

    const enabled = user
      ? user.defaultWallet !== null ||
        user.openingCash !== null ||
        user.openingDigital !== null ||
        (await this.transactions.hasExplicitWallet(userId)) ||
        (await this.transfers.hasAny(userId))
      : false;

    return {
      enabled,
      lines,
      total: lines.reduce((sum, l) => sum.add(l.balance), Money.zero()),
      transfers: [],
    };
  }
}
