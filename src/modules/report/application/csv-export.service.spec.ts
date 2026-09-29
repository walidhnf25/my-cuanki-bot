import ExcelJS from 'exceljs';
import { CategoryRepository } from 'src/modules/category/domain/category.repository';
import { SummaryPeriod } from 'src/modules/parser/domain/parsed-intent';
import { TransactionEntity } from 'src/modules/transaction/domain/transaction.entity';
import { TransactionRepository } from 'src/modules/transaction/domain/transaction.repository';
import { TransactionType, Wallet } from 'src/shared/domain/enums';
import { Money } from 'src/shared/utils/money';
import { CsvExportService } from './csv-export.service';

function tx(over: Partial<TransactionEntity> = {}): TransactionEntity {
  return {
    id: 't',
    userId: 'u1',
    categoryId: 'cat-food',
    type: TransactionType.EXPENSE,
    amount: Money.fromMajor(25000),
    description: 'kopi',
    note: null,
    occurredAt: new Date('2026-07-15T05:00:00.000Z'),
    sourceMessage: '',
    messageId: 'w',
    wallet: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

describe('CsvExportService (xlsx)', () => {
  let transactions: jest.Mocked<TransactionRepository>;
  let categories: jest.Mocked<CategoryRepository>;
  let service: CsvExportService;

  async function load(buf: Buffer): Promise<ExcelJS.Workbook> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    return wb;
  }

  beforeEach(() => {
    transactions = {
      findManyInRange: jest.fn(),
    } as unknown as jest.Mocked<TransactionRepository>;
    categories = { findById: jest.fn() } as unknown as jest.Mocked<CategoryRepository>;
    service = new CsvExportService(transactions, categories);
  });

  it('builds a transaction sheet sorted by date with numeric amounts', async () => {
    transactions.findManyInRange.mockResolvedValue([
      tx({ description: 'kopi susu', occurredAt: new Date('2026-07-16T05:00:00.000Z') }),
      tx({ description: 'nasi, ayam', occurredAt: new Date('2026-07-15T05:00:00.000Z') }),
    ]);
    categories.findById.mockResolvedValue({ name: 'Makanan' } as never);

    const out = await service.export('u1', SummaryPeriod.Month, new Date(), 'Asia/Jakarta');
    expect(out.rowCount).toBe(2);
    expect(out.filename).toBe('transaksi-bulan-ini.xlsx');
    expect(out.mimeType).toContain('spreadsheetml');

    const sheet = (await load(out.content)).getWorksheet('Transaksi')!;
    expect(sheet.getRow(4).values).toEqual([
      undefined,
      'Tanggal',
      'Tipe',
      'Jumlah',
      'Deskripsi',
      'Kategori',
    ]);
    expect(sheet.getRow(5).getCell(1).value).toBe('15/07/2026');
    expect(sheet.getRow(5).getCell(3).value).toBe(25000);
    expect(sheet.getRow(5).getCell(4).value).toBe('nasi, ayam');
    expect(sheet.getRow(6).getCell(4).value).toBe('kopi susu');
    expect(sheet.getRow(6).getCell(5).value).toBe('Makanan');
    expect(categories.findById).toHaveBeenCalledTimes(1);
  });

  it('adds a summary below the table with totals and category breakdown', async () => {
    transactions.findManyInRange.mockResolvedValue([
      tx({
        description: 'gaji',
        type: TransactionType.INCOME,
        amount: Money.fromMajor(100000),
        categoryId: null,
      }),
      tx({ description: 'kopi', amount: Money.fromMajor(25000) }),
      tx({ description: 'makan', amount: Money.fromMajor(75000) }),
    ]);
    categories.findById.mockResolvedValue({ name: 'Makanan' } as never);

    const out = await service.export('u1', SummaryPeriod.Month, new Date(), 'Asia/Jakarta');
    const sheet = (await load(out.content)).getWorksheet('Transaksi')!;

    expect(sheet.getCell('A10').value).toBe('RINGKASAN');
    expect(sheet.getCell('C11').value).toBe(3);
    expect(sheet.getCell('C12').value).toBe(100000);
    expect(sheet.getCell('C13').value).toBe(100000);
    expect(sheet.getCell('C14').value).toBe(0);
    expect(sheet.getCell('A16').value).toBe('Pengeluaran per Kategori');
    expect(sheet.getCell('A17').value).toBe('Makanan');
    expect(sheet.getCell('D17').value).toBe(1);
  });

  describe('with wallets', () => {
    const overview = {
      enabled: true,
      lines: [
        {
          wallet: Wallet.CASH,
          income: Money.fromMajor(100000),
          expense: Money.fromMajor(25000),
          balance: Money.fromMajor(75000),
          categories: [],
        },
        {
          wallet: Wallet.DIGITAL,
          income: Money.zero(),
          expense: Money.fromMajor(10000),
          balance: Money.fromMajor(190000),
          categories: [],
        },
      ],
      total: Money.fromMajor(265000),
    };

    it('adds a Dompet column and a per-wallet summary table', async () => {
      transactions.findManyInRange.mockResolvedValue([
        tx({ description: 'kopi', wallet: null }),
        tx({ description: 'bensin', wallet: Wallet.DIGITAL }),
      ]);
      categories.findById.mockResolvedValue({ name: 'Makanan' } as never);

      const out = await service.export(
        'u1',
        SummaryPeriod.Month,
        new Date(),
        'Asia/Jakarta',
        undefined,
        overview,
      );
      const sheet = (await load(out.content)).getWorksheet('Transaksi')!;

      expect(sheet.getCell('F4').value).toBe('Dompet');
      expect(sheet.getCell('F5').value).toBe('Cash');
      expect(sheet.getCell('F6').value).toBe('Digital');

      // Summary: band 9, cards 10-13, blank, wallet table starts at 15.
      expect(sheet.getCell('A15').value).toBe('Per Dompet');
      expect(sheet.getCell('A16').value).toBe('Cash');
      expect(sheet.getCell('E16').value).toBe(75000);
      expect(sheet.getCell('A17').value).toBe('Digital');
      expect(sheet.getCell('E17').value).toBe(190000);
      expect(sheet.getCell('A18').value).toBe('Total Saldo');
      expect(sheet.getCell('E18').value).toBe(265000);

      // Expense categories split per wallet, right after the wallet table.
      expect(sheet.getCell('A20').value).toBe('Pengeluaran per Kategori');
      expect(sheet.getCell('C20').value).toBe('Cash');
      expect(sheet.getCell('D20').value).toBe('Digital');
      expect(sheet.getCell('E20').value).toBe('Total');
      expect(sheet.getCell('A21').value).toBe('Makanan');
      expect(sheet.getCell('C21').value).toBe(25000);
      expect(sheet.getCell('D21').value).toBe(25000);
      expect(sheet.getCell('E21').value).toBe(50000);
    });

    it('omits wallet detail when wallets are not enabled', async () => {
      transactions.findManyInRange.mockResolvedValue([tx()]);
      categories.findById.mockResolvedValue({ name: 'Makanan' } as never);

      const out = await service.export(
        'u1',
        SummaryPeriod.Month,
        new Date(),
        'Asia/Jakarta',
        undefined,
        { ...overview, enabled: false },
      );
      const sheet = (await load(out.content)).getWorksheet('Transaksi')!;
      expect(sheet.getCell('F4').value).toBeNull();
      expect(sheet.getCell('A15').value).not.toBe('Per Dompet');
    });
  });
});
