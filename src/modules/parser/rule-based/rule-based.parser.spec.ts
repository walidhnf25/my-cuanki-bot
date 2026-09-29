import { toIsoDate } from 'src/shared/utils/date.util';
import { BudgetPeriod, TransactionType, Wallet } from 'src/shared/domain/enums';
import { IntentType, ParsedIntent, SummaryPeriod } from '../domain/parsed-intent';
import { RuleBasedParser } from './rule-based.parser';

const TZ = 'Asia/Jakarta';
// Wednesday 2026-07-15, 10:00 WIB.
const NOW = new Date('2026-07-15T03:00:00.000Z');

describe('RuleBasedParser', () => {
  const parser = new RuleBasedParser();
  const parse = (text: string): Promise<ParsedIntent> =>
    parser.parse({ text, now: NOW, timezone: TZ });

  describe('record expense', () => {
    it('parses "Beli kopi 25 ribu"', async () => {
      const intent = await parse('Beli kopi 25 ribu');
      expect(intent.type).toBe(IntentType.RecordTransaction);
      if (intent.type !== IntentType.RecordTransaction) return;
      expect(intent.transactionType).toBe(TransactionType.EXPENSE);
      expect(intent.amount?.toNumber()).toBe(25000);
      expect(intent.keywords).toContain('kopi');
      expect(toIsoDate(intent.occurredAt, TZ)).toBe('2026-07-15');
    });

    it('parses "Isi bensin 100rb" and strips the verb', async () => {
      const intent = await parse('Isi bensin 100rb');
      expect(intent.type).toBe(IntentType.RecordTransaction);
      if (intent.type !== IntentType.RecordTransaction) return;
      expect(intent.transactionType).toBe(TransactionType.EXPENSE);
      expect(intent.amount?.toNumber()).toBe(100000);
      expect(intent.keywords).toContain('bensin');
    });

    it('parses expense with a relative date "makan bakso kemarin 15rb"', async () => {
      const intent = await parse('makan bakso kemarin 15rb');
      expect(intent.type).toBe(IntentType.RecordTransaction);
      if (intent.type !== IntentType.RecordTransaction) return;
      expect(intent.amount?.toNumber()).toBe(15000);
      expect(intent.keywords).toContain('bakso');
      expect(toIsoDate(intent.occurredAt, TZ)).toBe('2026-07-14');
    });

    it('asks for clarification when amount is missing ("Beli kopi")', async () => {
      const intent = await parse('Beli kopi');
      expect(intent.type).toBe(IntentType.RecordTransaction);
      if (intent.type !== IntentType.RecordTransaction) return;
      expect(intent.amount).toBeNull();
      expect(intent.keywords).toContain('kopi');
    });
  });

  describe('record income', () => {
    it('parses "Gaji 8 juta" as income', async () => {
      const intent = await parse('Gaji 8 juta');
      expect(intent.type).toBe(IntentType.RecordTransaction);
      if (intent.type !== IntentType.RecordTransaction) return;
      expect(intent.transactionType).toBe(TransactionType.INCOME);
      expect(intent.amount?.toNumber()).toBe(8_000_000);
      expect(intent.keywords).toContain('gaji');
    });

    it('parses "dapat bonus 500rb" as income', async () => {
      const intent = await parse('dapat bonus 500rb');
      expect(intent.type).toBe(IntentType.RecordTransaction);
      if (intent.type !== IntentType.RecordTransaction) return;
      expect(intent.transactionType).toBe(TransactionType.INCOME);
      expect(intent.amount?.toNumber()).toBe(500000);
    });
  });

  describe('amount-only (clarification reply)', () => {
    it('parses a bare "25 ribu"', async () => {
      const intent = await parse('25 ribu');
      expect(intent.type).toBe(IntentType.AmountOnly);
      if (intent.type !== IntentType.AmountOnly) return;
      expect(intent.amount.toNumber()).toBe(25000);
    });
  });

  describe('summary', () => {
    it.each([
      ['ringkasan hari ini', SummaryPeriod.Day],
      ['rekap minggu ini', SummaryPeriod.Week],
      ['Ringkasan bulan ini', SummaryPeriod.Month],
      ['laporan', SummaryPeriod.Month],
    ])('parses "%s"', async (text, period) => {
      const intent = await parse(text);
      expect(intent.type).toBe(IntentType.Summary);
      if (intent.type !== IntentType.Summary) return;
      expect(intent.period).toBe(period);
    });
  });

  describe('budget', () => {
    it('parses "Budget makan 2 juta"', async () => {
      const intent = await parse('Budget makan 2 juta');
      expect(intent.type).toBe(IntentType.SetBudget);
      if (intent.type !== IntentType.SetBudget) return;
      expect(intent.amount?.toNumber()).toBe(2_000_000);
      expect(intent.keywords).toContain('makan');
      expect(intent.period).toBe(BudgetPeriod.MONTHLY);
    });

    it('detects a weekly budget period', async () => {
      const intent = await parse('anggaran jajan mingguan 200rb');
      expect(intent.type).toBe(IntentType.SetBudget);
      if (intent.type !== IntentType.SetBudget) return;
      expect(intent.period).toBe(BudgetPeriod.WEEKLY);
    });
  });

  describe('other commands', () => {
    it('parses delete', async () => {
      expect((await parse('hapus')).type).toBe(IntentType.DeleteTransaction);
      expect((await parse('batalkan transaksi terakhir')).type).toBe(IntentType.DeleteTransaction);
    });

    it('parses edit with a new amount', async () => {
      const intent = await parse('edit jadi 30rb');
      expect(intent.type).toBe(IntentType.EditTransaction);
      if (intent.type !== IntentType.EditTransaction) return;
      expect(intent.amount?.toNumber()).toBe(30000);
    });

    it('parses export', async () => {
      const intent = await parse('export bulan ini');
      expect(intent.type).toBe(IntentType.Export);
    });

    it('parses help and greeting', async () => {
      expect((await parse('help')).type).toBe(IntentType.Help);
      expect((await parse('bantuan')).type).toBe(IntentType.Help);
      expect((await parse('halo')).type).toBe(IntentType.Greeting);
    });

    it('returns Unknown for gibberish', async () => {
      expect((await parse('asdfghjkl')).type).toBe(IntentType.Unknown);
    });
  });

  describe('wallets', () => {
    it.each([
      ['beli kopi 25rb cash', Wallet.CASH],
      ['bayar tunai bakso 15rb', Wallet.CASH],
      ['gaji 5 juta transfer', Wallet.DIGITAL],
      ['bensin 50rb gopay', Wallet.DIGITAL],
      ['makan siang 30rb qris', Wallet.DIGITAL],
    ])('detects the wallet in "%s"', async (text, wallet) => {
      const intent = await parse(text);
      expect(intent.type).toBe(IntentType.RecordTransaction);
      if (intent.type !== IntentType.RecordTransaction) return;
      expect(intent.wallet).toBe(wallet);
    });

    it('leaves wallet null when none is named and keeps it out of keywords', async () => {
      const plain = await parse('beli kopi 25rb');
      const named = await parse('beli kopi 25rb cash');
      if (plain.type !== IntentType.RecordTransaction) throw new Error('unexpected intent');
      if (named.type !== IntentType.RecordTransaction) throw new Error('unexpected intent');
      expect(plain.wallet).toBeNull();
      expect(named.keywords).toEqual(plain.keywords);
      expect(named.description).toBe('kopi');
    });

    it('keeps the wallet when the amount is still missing', async () => {
      const intent = await parse('beli kopi cash');
      if (intent.type !== IntentType.RecordTransaction) throw new Error('unexpected intent');
      expect(intent.amount).toBeNull();
      expect(intent.wallet).toBe(Wallet.CASH);
    });

    it('does not treat "cashback" as a wallet', async () => {
      const intent = await parse('cashback 5rb');
      if (intent.type !== IntentType.RecordTransaction) throw new Error('unexpected intent');
      expect(intent.wallet).toBeNull();
    });

    it('parses the balance command', async () => {
      expect((await parse('saldo')).type).toBe(IntentType.Balance);
      expect((await parse('cek saldo')).type).toBe(IntentType.Balance);
    });

    it('parses opening balance', async () => {
      const intent = await parse('saldo awal cash 200rb');
      expect(intent.type).toBe(IntentType.SetOpeningBalance);
      if (intent.type !== IntentType.SetOpeningBalance) return;
      expect(intent.wallet).toBe(Wallet.CASH);
      expect(intent.amount?.toNumber()).toBe(200000);
    });

    it('parses opening balance with a missing wallet', async () => {
      const intent = await parse('saldo awal 200rb');
      if (intent.type !== IntentType.SetOpeningBalance) throw new Error('unexpected intent');
      expect(intent.wallet).toBeNull();
    });

    it('parses the default wallet command', async () => {
      const intent = await parse('default digital');
      expect(intent.type).toBe(IntentType.SetDefaultWallet);
      if (intent.type !== IntentType.SetDefaultWallet) return;
      expect(intent.wallet).toBe(Wallet.DIGITAL);
    });

    it('parses a wallet change on edit', async () => {
      const intent = await parse('edit ke digital');
      expect(intent.type).toBe(IntentType.EditTransaction);
      if (intent.type !== IntentType.EditTransaction) return;
      expect(intent.wallet).toBe(Wallet.DIGITAL);
      expect(intent.keywords).toEqual([]);
    });
  });

  describe('transfers', () => {
    const transferOf = async (text: string) => {
      const intent = await parse(text);
      if (intent.type !== IntentType.Transfer) throw new Error(`not a transfer: ${text}`);
      return intent;
    };

    it.each([
      ['tarik tunai 500rb', Wallet.DIGITAL, Wallet.CASH, 500000],
      ['tarik 1 juta', Wallet.DIGITAL, Wallet.CASH, 1000000],
      ['setor tunai 200rb', Wallet.CASH, Wallet.DIGITAL, 200000],
      ['pindah 300rb dari cash ke digital', Wallet.CASH, Wallet.DIGITAL, 300000],
      ['pindahkan 300rb dari digital ke cash', Wallet.DIGITAL, Wallet.CASH, 300000],
      ['pindah 300rb ke cash', Wallet.DIGITAL, Wallet.CASH, 300000],
      ['pindah 300rb dari cash', Wallet.CASH, Wallet.DIGITAL, 300000],
    ])('parses "%s"', async (text, from, to, amount) => {
      const intent = await transferOf(text);
      expect(intent.from).toBe(from);
      expect(intent.to).toBe(to);
      expect(intent.amount?.toNumber()).toBe(amount);
    });

    it('leaves gaps for the bot to ask about', async () => {
      const noDirection = await transferOf('pindah 300rb');
      expect(noDirection.from).toBeNull();
      expect(noDirection.to).toBeNull();
      const noAmount = await transferOf('tarik tunai');
      expect(noAmount.amount).toBeNull();
    });

    it('parses deleting the latest transfer', async () => {
      expect((await parse('hapus transfer')).type).toBe(IntentType.DeleteTransfer);
      expect((await parse('batal pindah')).type).toBe(IntentType.DeleteTransfer);
      expect((await parse('hapus transfer terakhir')).type).toBe(IntentType.DeleteTransfer);
    });

    it('does not confuse ordinary messages with transfers', async () => {
      expect((await parse('hapus bensin transfer')).type).toBe(IntentType.DeleteTransaction);
      expect((await parse('hapus')).type).toBe(IntentType.DeleteTransaction);
      expect((await parse('gaji 5 juta transfer')).type).toBe(IntentType.RecordTransaction);
      expect((await parse('setor 100rb')).type).not.toBe(IntentType.Transfer);
    });
  });

  describe('parseAmount (clarification helper)', () => {
    it('extracts a bare amount', () => {
      expect(parser.parseAmount('25 ribu')?.toNumber()).toBe(25000);
      expect(parser.parseAmount('tidak ada angka')).toBeNull();
    });
  });
});
