import { toIsoDate } from 'src/shared/utils/date.util';
import { BudgetPeriod, TransactionType } from 'src/shared/domain/enums';
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

  describe('parseAmount (clarification helper)', () => {
    it('extracts a bare amount', () => {
      expect(parser.parseAmount('25 ribu')?.toNumber()).toBe(25000);
      expect(parser.parseAmount('tidak ada angka')).toBeNull();
    });
  });
});
