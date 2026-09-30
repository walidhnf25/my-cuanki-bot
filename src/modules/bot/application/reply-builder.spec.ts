import { TransactionType, Wallet, WalletMode } from 'src/shared/domain/enums';
import { Money } from 'src/shared/utils/money';
import { IntentType, ParsedIntent } from 'src/modules/parser/domain/parsed-intent';
import { ReplyBuilder } from './reply-builder';

describe('ReplyBuilder', () => {
  const replies = new ReplyBuilder();

  it('builds an onboarding message with the name', () => {
    const msg = replies.onboarding('Budi');
    expect(msg).toContain('Budi');
    expect(msg).toContain('Cuanki');
    expect(msg).toContain('beli kopi 25rb');
  });

  it('acknowledges a recorded expense with formatted amount', () => {
    const intent: ParsedIntent = {
      type: IntentType.RecordTransaction,
      raw: 'beli kopi 25rb',
      transactionType: TransactionType.EXPENSE,
      amount: Money.fromMajor(25000),
      description: 'kopi',
      keywords: ['kopi'],
      occurredAt: new Date(),
      wallet: null,
    };
    const reply = replies.compose(intent);
    expect(reply).toContain('Pengeluaran');
    expect(reply).toContain('Rp25.000');
    expect(reply).toContain('kopi');
  });

  it('asks for the price when the amount is missing', () => {
    const intent: ParsedIntent = {
      type: IntentType.RecordTransaction,
      raw: 'beli kopi',
      transactionType: TransactionType.EXPENSE,
      amount: null,
      description: 'kopi',
      keywords: ['kopi'],
      occurredAt: new Date(),
      wallet: null,
    };
    expect(replies.compose(intent)).toContain('Berapa harganya');
  });

  it('shows the wallet only when the transaction has one', () => {
    const base = {
      transaction: {
        id: 't',
        userId: 'u',
        categoryId: null,
        type: TransactionType.EXPENSE,
        amount: Money.fromMajor(25000),
        description: 'kopi',
        note: null,
        occurredAt: new Date(),
        sourceMessage: null,
        messageId: null,
        wallet: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      category: null,
    };
    expect(replies.recorded(base, 'Asia/Jakarta')).not.toContain('Cash');
    expect(
      replies.recorded(
        { ...base, transaction: { ...base.transaction, wallet: Wallet.DIGITAL } },
        'Asia/Jakarta',
      ),
    ).toContain('Digital');
  });

  it('lists per-wallet figures in the summary only when wallets are enabled', () => {
    const summary = {
      periodLabel: 'Bulan Ini',
      range: { start: new Date(), end: new Date() },
      income: Money.fromMajor(100),
      expense: Money.fromMajor(50),
      balance: Money.fromMajor(50),
      categories: [],
    };
    const line = (wallet: Wallet) => ({
      wallet,
      income: Money.zero(),
      expense: Money.zero(),
      balance: Money.fromMajor(1000),
      startBalance: Money.zero(),
      transferIn: wallet === Wallet.DIGITAL ? Money.fromMajor(500) : Money.zero(),
      transferOut: Money.zero(),
      categories:
        wallet === Wallet.CASH
          ? [{ name: 'Makanan', icon: '🍜', total: Money.fromMajor(75000) }]
          : [{ name: 'Transportasi', icon: '🚗', total: Money.fromMajor(20000) }],
    });
    const overview = {
      mode: WalletMode.BOTH,
      enabled: true,
      lines: [line(Wallet.CASH), line(Wallet.DIGITAL)],
      total: Money.fromMajor(2000),
      transfers: [],
    };

    expect(replies.summary(summary)).not.toContain('Per dompet');
    expect(replies.summary(summary, { ...overview, mode: null, enabled: false })).not.toContain(
      'Per dompet',
    );
    const text = replies.summary(summary, overview);
    expect(text).toContain('Per dompet');

    // Period figures are labelled as a difference; the real balance is the wallet total.
    expect(text).toContain('Selisih: Rp50');
    expect(text).not.toContain('💵 Saldo:');
    expect(text).toContain('Total saldo dompet: *Rp2.000*');
    expect(replies.summary(summary)).toContain('💵 Saldo: Rp50');
    expect(replies.summary(summary, { ...overview, mode: null, enabled: false })).toContain(
      '💵 Saldo: Rp50',
    );
    expect(text).toContain('💰 Saldo: *Rp1.000*');
    // Nothing carried over: the line stays out instead of showing Rp0.
    expect(text).not.toContain('Saldo sebelumnya');
    expect(text).toContain('⬆️ Masuk: Rp0');
    expect(text).toContain('⬇️ Keluar: Rp0');

    // Categories are listed under their own wallet, in wallet order.
    expect(text.indexOf('Cash')).toBeLessThan(text.indexOf('Makanan: Rp75.000'));
    expect(text.indexOf('Makanan: Rp75.000')).toBeLessThan(text.indexOf('Digital'));
    expect(text.indexOf('Digital')).toBeLessThan(text.indexOf('Transportasi: Rp20.000'));
    // The combined list is replaced, not repeated.
    expect(text.match(/Pengeluaran per kategori/g)).toHaveLength(2);

    // A transfer line appears only for wallets that moved money.
    expect(text.match(/🔁 Transfer/g)).toHaveLength(1);
    expect(text).toContain('🔁 Transfer: masuk Rp500 · keluar Rp0');
  });

  it('summarises a one-wallet user with the normal category list and that wallet balance', () => {
    const summary = {
      periodLabel: 'Bulan Ini',
      range: { start: new Date(), end: new Date() },
      income: Money.fromMajor(100),
      expense: Money.fromMajor(50),
      balance: Money.fromMajor(50),
      categories: [{ name: 'Makanan', icon: '🍜', total: Money.fromMajor(50) }],
    };
    const overview = {
      mode: WalletMode.CASH,
      enabled: true,
      lines: [
        {
          wallet: Wallet.CASH,
          income: Money.zero(),
          expense: Money.zero(),
          startBalance: Money.zero(),
          transferIn: Money.zero(),
          transferOut: Money.zero(),
          balance: Money.fromMajor(29000),
          categories: [],
        },
      ],
      total: Money.fromMajor(29000),
      transfers: [],
    };

    const text = replies.summary(summary, overview);
    expect(text).not.toContain('Per dompet');
    expect(text).toContain('Makanan: Rp50');
    expect(text).toContain('Saldo 💵 Cash: *Rp29.000*');
  });

  it('shows a per-wallet ledger that adds up to the balance', () => {
    const summary = {
      periodLabel: 'Bulan Ini',
      range: { start: new Date(), end: new Date() },
      income: Money.fromMajor(50000),
      expense: Money.fromMajor(20000),
      balance: Money.fromMajor(30000),
      categories: [],
    };
    const overview = {
      mode: WalletMode.BOTH,
      enabled: true,
      lines: [
        {
          wallet: Wallet.CASH,
          startBalance: Money.fromMajor(100000),
          income: Money.fromMajor(50000),
          expense: Money.fromMajor(20000),
          transferIn: Money.zero(),
          transferOut: Money.fromMajor(10000),
          balance: Money.fromMajor(120000), // 100.000 + 50.000 - 20.000 - 10.000
          categories: [],
        },
        {
          wallet: Wallet.DIGITAL,
          startBalance: Money.fromMajor(522000),
          income: Money.zero(),
          expense: Money.zero(),
          transferIn: Money.fromMajor(10000),
          transferOut: Money.zero(),
          balance: Money.fromMajor(532000), // 522.000 + 10.000
          categories: [],
        },
      ],
      total: Money.fromMajor(652000),
      transfers: [],
    };

    const text = replies.summary(summary, overview);
    const cash = text.slice(text.indexOf('Cash'), text.indexOf('Digital'));

    const order = [
      'Saldo sebelumnya: Rp100.000',
      'Masuk: Rp50.000',
      'Keluar: Rp20.000',
      'Transfer: masuk Rp0 · keluar Rp10.000',
      'Saldo: *Rp120.000*',
    ].map((part) => cash.indexOf(part));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order); // read top to bottom

    const digital = text.slice(text.indexOf('Digital'));
    expect(digital).toContain('Saldo sebelumnya: Rp522.000');
    expect(digital).toContain('Transfer: masuk Rp10.000 · keluar Rp0');
    expect(digital).toContain('Saldo: *Rp532.000*');
  });

  it('words the opening balance confirmation as income, and zero as removal', () => {
    const set = replies.openingBalanceSet(Wallet.CASH, Money.fromMajor(200000));
    expect(set).toContain('Rp200.000');
    expect(set).toContain('Pemasukan');
    expect(replies.openingBalanceSet(Wallet.CASH, Money.zero())).toContain('dihapus');
  });

  it('describes each wallet mode and explains a refused change', () => {
    expect(replies.askWalletMode()).toContain('Cash saja');
    expect(replies.askWalletMode()).toContain('Digital saja');
    expect(replies.askWalletMode()).toContain('Cash dan Digital');
    expect(replies.walletModeSet(WalletMode.CASH)).toContain('Cash saja');
    expect(replies.walletModeSet(WalletMode.DIGITAL)).toContain('Digital saja');
    expect(replies.walletModeSet(WalletMode.BOTH)).toContain('Cash dan Digital');
    expect(replies.walletModeBlocked(Wallet.DIGITAL)).toContain('tidak bisa dinonaktifkan');
  });

  it('words the opening balance questions per wallet', () => {
    expect(replies.askOpeningBalanceFor(Wallet.CASH)).toContain('Cash');
    expect(replies.askOpeningBalanceFor(Wallet.DIGITAL)).toContain('lewati');
    expect(replies.openingBalanceAck(Wallet.CASH, Money.fromMajor(200000))).toContain('Rp200.000');
    expect(replies.openingBalanceAck(Wallet.DIGITAL, null)).toContain('dilewati');
    expect(replies.openingBalanceDone()).toContain('saldo');
    expect(replies.openingBalanceRetry(Wallet.CASH)).toContain('batal');
  });

  it('shows the help menu', () => {
    expect(replies.compose({ type: IntentType.Help, raw: 'help' })).toContain('Menu Cuanki');
  });

  describe('recording several transactions', () => {
    const NOW = new Date('2026-07-15T03:00:00.000Z');
    const result = (
      description: string,
      amount: number,
      over: Record<string, unknown> = {},
      category: { name: string; icon: string } | null = { name: 'Makanan', icon: '🍜' },
    ) =>
      ({
        transaction: {
          id: description,
          userId: 'u',
          categoryId: null,
          type: TransactionType.EXPENSE,
          amount: Money.fromMajor(amount),
          description,
          note: null,
          occurredAt: NOW,
          sourceMessage: null,
          messageId: null,
          wallet: null,
          deletedAt: null,
          createdAt: NOW,
          updatedAt: NOW,
          ...over,
        },
        category,
      }) as never;

    it('lists each item and the total', () => {
      const text = replies.recordedMany(
        [result('ayam', 8000), result('es teh manis', 5000, {}, { name: 'Minuman', icon: '🥤' })],
        'Asia/Jakarta',
        NOW,
      );

      expect(text).toContain('2 transaksi dicatat');
      expect(text).toContain('1. 🍜 ayam — *Rp8.000*');
      expect(text).toContain('2. 🥤 es teh manis — *Rp5.000*');
      expect(text).toContain('💸 Pengeluaran: Rp13.000');
      expect(text).not.toContain('Pemasukan');
    });

    it('shows wallets and dates only when they add information', () => {
      const text = replies.recordedMany(
        [
          result('ayam', 8000),
          result('teh', 5000, {
            wallet: Wallet.DIGITAL,
            occurredAt: new Date('2026-07-14T03:00:00.000Z'),
          }),
        ],
        'Asia/Jakarta',
        NOW,
      );
      const [first, second] = text.split('\n').filter((l) => /^\d\./.test(l));

      expect(first).not.toContain('Digital');
      expect(first).not.toContain('📅');
      expect(second).toContain('📱 Digital');
      expect(second).toContain('📅 14/07/2026');
    });

    it('totals income and expense separately', () => {
      const text = replies.recordedMany(
        [
          result('gaji', 5000000, { type: TransactionType.INCOME }, null),
          result('kopi', 10000),
          result('teh', 5000),
        ],
        'Asia/Jakarta',
        NOW,
      );
      expect(text).toContain('💰 Pemasukan: Rp5.000.000');
      expect(text).toContain('💸 Pengeluaran: Rp15.000');
      expect(text).toContain('1. 📦 gaji');
    });

    it('asks once for the wallet, listing only the items that need it', () => {
      const text = replies.askWalletBatch([
        { description: 'ayam', amount: Money.fromMajor(8000) },
        { description: 'es teh manis', amount: Money.fromMajor(5000) },
      ]);
      expect(text).toContain('2 transaksi');
      expect(text).toContain('• ayam Rp8.000');
      expect(text).toContain('• es teh manis Rp5.000');
      expect(text).toContain('cash');
      expect(text).toContain('digital');
    });

    it('explains the batch limit', () => {
      expect(replies.tooManyItems(15)).toContain('15');
    });
  });

  describe('help menu', () => {
    const help = () => replies.compose({ type: IntentType.Help, raw: 'help' });

    it('is one message that carries the wallet commands too', () => {
      const text = help();
      expect(text).toContain('Menu Cuanki');
      expect(text).not.toContain('Menu Dompet');
      expect(text).not.toContain('pesan berikutnya');
      for (const word of ['Dompet Cash', 'Dompet Digital', 'Transfer antar dompet', 'saldo awal']) {
        expect(text).toContain(word);
      }
    });

    it('mentions recording several transactions at once', () => {
      expect(help()).toContain('beli ayam 8rb, beli es teh 5rb');
    });

    it('covers every everyday command', () => {
      const text = help();
      for (const word of [
        'beli kopi',
        'gaji',
        'ringkasan',
        'edit jadi',
        'hapus',
        'budget',
        'export',
        'reset',
      ]) {
        expect(text).toContain(word);
      }
      expect(text).toContain('Excel');
      expect(text).toContain('konfirmasi');
    });

    it('lists the wallet sections in reading order, each with its own examples', () => {
      const text = help();
      const at = (heading: string) => text.indexOf(heading);
      const [cash, digital, transfer, balance, settings] = [
        'Dompet Cash',
        'Dompet Digital',
        'Transfer antar dompet',
        'Saldo:',
        'Pengaturan dompet',
      ].map(at);

      expect([cash, digital, transfer, balance, settings].every((i) => i > -1)).toBe(true);
      expect(cash).toBeLessThan(digital);
      expect(digital).toBeLessThan(transfer);
      expect(transfer).toBeLessThan(balance);
      expect(balance).toBeLessThan(settings);
      expect(text.slice(cash, digital)).toContain('tunai');
      expect(text.slice(digital, transfer)).toContain('qris');
      expect(text.slice(transfer, balance)).toContain('tarik tunai');
      expect(text.slice(balance, settings)).toContain('saldo awal cash 0');
      expect(text.slice(settings)).toContain('atur dompet');
    });

    it("keeps editing a transaction's wallet with the other edit commands", () => {
      const text = help();
      const edit = text.indexOf('Kelola transaksi terakhir');
      const budget = text.indexOf('Budget:');
      expect(text.slice(edit, budget)).toContain('edit ke digital');
    });
  });

  it('falls back for unknown input', () => {
    expect(replies.compose({ type: IntentType.Unknown, raw: 'xyz' })).toContain('help');
  });
});
