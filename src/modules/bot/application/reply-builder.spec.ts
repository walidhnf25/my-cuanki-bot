import { TransactionType, Wallet } from 'src/shared/domain/enums';
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
      transferIn: wallet === Wallet.DIGITAL ? Money.fromMajor(500) : Money.zero(),
      transferOut: Money.zero(),
      categories:
        wallet === Wallet.CASH
          ? [{ name: 'Makanan', icon: '🍜', total: Money.fromMajor(75000) }]
          : [{ name: 'Transportasi', icon: '🚗', total: Money.fromMajor(20000) }],
    });
    const overview = {
      enabled: true,
      lines: [line(Wallet.CASH), line(Wallet.DIGITAL)],
      total: Money.fromMajor(2000),
      transfers: [],
    };

    expect(replies.summary(summary)).not.toContain('Per dompet');
    expect(replies.summary(summary, { ...overview, enabled: false })).not.toContain('Per dompet');
    const text = replies.summary(summary, overview);
    expect(text).toContain('Per dompet');

    // Period figures are labelled as a difference; the real balance is the wallet total.
    expect(text).toContain('Selisih periode: Rp50');
    expect(text).not.toContain('💵 Saldo:');
    expect(text).toContain('Total saldo dompet: *Rp2.000*');
    expect(replies.summary(summary)).toContain('💵 Saldo: Rp50');
    expect(replies.summary(summary, { ...overview, enabled: false })).toContain('💵 Saldo: Rp50');
    expect(text).toContain('Cash: saldo *Rp1.000*');
    expect(text).toContain('⬆️ Masuk Rp0');
    expect(text).toContain('⬇️ Keluar Rp0');

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

  it('shows the help menu', () => {
    expect(replies.compose({ type: IntentType.Help, raw: 'help' })).toContain('Menu Cuanki');
  });

  it('lists cash, digital, transfer and balance commands in separate sections', () => {
    const help = replies.compose({ type: IntentType.Help, raw: 'help' });
    const cash = help.indexOf('Dompet Cash');
    const digital = help.indexOf('Dompet Digital');
    const transfer = help.indexOf('Transfer antar dompet');
    const balance = help.indexOf('Saldo & pengaturan dompet');

    expect(cash).toBeGreaterThan(-1);
    expect(cash).toBeLessThan(digital);
    expect(digital).toBeLessThan(transfer);
    expect(transfer).toBeLessThan(balance);
    // Each section keeps its own examples.
    expect(help.slice(cash, digital)).toContain('tunai');
    expect(help.slice(digital, transfer)).toContain('qris');
    expect(help.slice(transfer, balance)).toContain('tarik tunai');
  });

  it('falls back for unknown input', () => {
    expect(replies.compose({ type: IntentType.Unknown, raw: 'xyz' })).toContain('help');
  });
});
