import { Injectable } from '@nestjs/common';
import { OPENING_BALANCE_CATEGORY } from 'src/modules/category/seed-data';
import { CategoryRepository } from 'src/modules/category/domain/category.repository';
import { customRangeInfo, resolvePeriod } from 'src/modules/report/application/period';
import { CategoryBreakdown } from 'src/modules/report/domain/summary.types';
import { DateRangeSpec, SummaryPeriod } from 'src/modules/parser/domain/parsed-intent';
import { TransactionEntity } from 'src/modules/transaction/domain/transaction.entity';
import { TransactionRepository } from 'src/modules/transaction/domain/transaction.repository';
import { UserEntity } from 'src/modules/user/domain/user.entity';
import { UserRepository } from 'src/modules/user/domain/user.repository';
import {
  activeWallets,
  DEFAULT_WALLET,
  TransactionType,
  Wallet,
  WalletMode,
} from 'src/shared/domain/enums';
import { Money } from 'src/shared/utils/money';
import { TransferEntity } from '../domain/transfer.entity';
import { TransferRepository } from '../domain/transfer.repository';

export interface WalletLine {
  wallet: Wallet;
  /** Money in / out over the reported window (all time for {@link WalletService.current}). */
  income: Money;
  expense: Money;
  /**
   * Balance when the reported window began, so that
   * startBalance + income - expense + transferIn - transferOut = balance.
   */
  startBalance: Money;
  /** Transfers received / sent over the reported window. */
  transferIn: Money;
  transferOut: Money;
  /** Balance at the end of the reported window (now, for the current periods). */
  balance: Money;
  /** Expense per category over the reported window, largest first (empty for current()). */
  categories: CategoryBreakdown[];
}

export interface WalletOverview {
  /** Wallets in use; null while the user has not chosen and never used a wallet feature. */
  mode: WalletMode | null;
  /** True once the user has wallets on; reports only show wallet detail then. */
  enabled: boolean;
  lines: WalletLine[];
  total: Money;
  /** Transfers inside the reported period, oldest first (empty for current()). */
  transfers: TransferEntity[];
}

const WALLETS = [Wallet.CASH, Wallet.DIGITAL] as const;

/** Marks the income entry that holds a wallet's opening balance. */
export const OPENING_BALANCE_NOTE = 'SALDO_AWAL';

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

  /**
   * Choose which wallets to use. Turning a wallet off is refused while it still has
   * transactions, transfers or a balance, so no money silently disappears.
   */
  async setMode(
    userId: string,
    mode: WalletMode,
  ): Promise<{ ok: true } | { ok: false; blocked: Wallet }> {
    const user = await this.users.findById(userId);
    if (!user) throw new Error(`User ${userId} not found`);

    const active = activeWallets(mode);
    for (const wallet of WALLETS) {
      if (!active.includes(wallet) && (await this.inUse(user, wallet))) {
        return { ok: false, blocked: wallet };
      }
    }

    const wasSingle = user.walletMode === WalletMode.CASH || user.walletMode === WalletMode.DIGITAL;
    await this.users.update(userId, {
      walletMode: mode,
      // One wallet: it is the default. Back to both: forget the old single default so
      // the bot asks again (unless the user already used both).
      defaultWallet:
        mode === WalletMode.BOTH
          ? wasSingle
            ? null
            : user.defaultWallet
          : mode === WalletMode.CASH
            ? Wallet.CASH
            : Wallet.DIGITAL,
    });
    return { ok: true };
  }

  /** Opening-balance income entries of the user, for the given wallet. */
  private async openingEntries(userId: string, wallet: Wallet): Promise<TransactionEntity[]> {
    return (await this.transactions.findByNote(userId, OPENING_BALANCE_NOTE)).filter(
      (t) => (t.wallet ?? DEFAULT_WALLET) === wallet,
    );
  }

  private async inUse(user: UserEntity, wallet: Wallet): Promise<boolean> {
    const opening0 = opening(user, wallet);
    if (opening0 !== null && !opening0.isZero()) return true;
    if (await this.transactions.hasTransactionsInWallet(user.id, wallet)) return true;
    const moved = (await this.transfers.sumByWallet(user.id))[wallet];
    return !moved.in.isZero() || !moved.out.isZero();
  }

  /**
   * Set a wallet's opening balance. It is recorded as an income entry ("Saldo Awal")
   * dated now, so it shows up under Pemasukan and in the wallet's "Masuk". Setting it
   * again replaces the previous entry; zero just removes it.
   */
  async setOpeningBalance(
    userId: string,
    wallet: Wallet,
    amount: Money,
    now: Date,
    messageId: string | null,
  ): Promise<TransactionEntity | null> {
    for (const previous of await this.openingEntries(userId, wallet)) {
      await this.transactions.softDelete(previous.id);
    }
    await this.clearLegacyOpening(userId, wallet);
    if (amount.isZero()) return null;
    return this.createOpeningEntry(userId, wallet, amount, now, messageId);
  }

  private async createOpeningEntry(
    userId: string,
    wallet: Wallet,
    amount: Money,
    occurredAt: Date,
    messageId: string | null,
  ): Promise<TransactionEntity> {
    const category = await this.categories.findByNameAndType(
      OPENING_BALANCE_CATEGORY,
      TransactionType.INCOME,
      null,
    );
    return this.transactions.create({
      userId,
      categoryId: category?.id ?? null,
      type: TransactionType.INCOME,
      amount,
      description: 'Saldo awal',
      note: OPENING_BALANCE_NOTE,
      occurredAt,
      messageId,
      wallet,
    });
  }

  private async clearLegacyOpening(userId: string, wallet: Wallet): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user || opening(user, wallet) === null) return;
    await this.users.update(
      userId,
      wallet === Wallet.CASH ? { openingCash: null } : { openingDigital: null },
    );
  }

  /**
   * One-off conversion of opening balances stored on the user row (the old way) into
   * "Saldo Awal" income entries dated `now`. Safe to repeat: an entry is created at
   * most once per wallet (guarded by a deterministic message id), and the old value
   * is cleared afterwards. Returns the user as it stands after the conversion.
   */
  async migrateLegacyOpening(user: UserEntity, now: Date): Promise<UserEntity> {
    const legacy = WALLETS.map((wallet) => ({ wallet, amount: opening(user, wallet) })).filter(
      (l): l is { wallet: Wallet; amount: Money } => l.amount !== null,
    );
    if (legacy.length === 0) return user;

    for (const { wallet, amount } of legacy) {
      const key = `opening-migration:${user.id}:${wallet}`;
      if (!amount.isZero() && !(await this.transactions.existsByMessageId(key))) {
        await this.createOpeningEntry(user.id, wallet, amount, now, key);
      }
    }
    return this.users.update(user.id, { openingCash: null, openingDigital: null });
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
    // What happened inside the window, and everything up to its end (all time when
    // no window is given). The balance is the latter, so a ledger always adds up.
    const window = range ? await this.transactions.sumByWallet(userId, range) : undefined;
    const upTo = range
      ? await this.transactions.sumByWallet(userId, { start: new Date(0), end: range.end })
      : await this.transactions.sumByWallet(userId);
    const shown = window ?? upTo;
    const movedWindow = range ? await this.transfers.sumByWallet(userId, range) : undefined;
    const movedUpTo = range
      ? await this.transfers.sumByWallet(userId, { start: new Date(0), end: range.end })
      : await this.transfers.sumByWallet(userId);
    const movedShown = movedWindow ?? movedUpTo;

    const implicit = user
      ? user.defaultWallet !== null ||
        user.openingCash !== null ||
        user.openingDigital !== null ||
        (await this.transactions.hasExplicitWallet(userId)) ||
        (await this.transfers.hasAny(userId))
      : false;
    // Legacy users (no stored mode) are on once they have used a wallet feature.
    const mode = user?.walletMode ?? (implicit ? WalletMode.BOTH : null);

    const lines: WalletLine[] = activeWallets(mode).map((wallet) => {
      // A legacy opening balance (not yet converted) still counts until it is migrated.
      const balance = (user ? (opening(user, wallet) ?? Money.zero()) : Money.zero())
        .add(upTo[wallet].income)
        .subtract(upTo[wallet].expense)
        .add(movedUpTo[wallet].in)
        .subtract(movedUpTo[wallet].out);
      return {
        wallet,
        startBalance: balance
          .subtract(shown[wallet].income)
          .add(shown[wallet].expense)
          .subtract(movedShown[wallet].in)
          .add(movedShown[wallet].out),
        income: shown[wallet].income,
        expense: shown[wallet].expense,
        transferIn: movedShown[wallet].in,
        transferOut: movedShown[wallet].out,
        categories: [],
        balance,
      };
    });

    return {
      mode,
      enabled: mode !== null,
      lines,
      total: lines.reduce((sum, l) => sum.add(l.balance), Money.zero()),
      transfers: [],
    };
  }
}
