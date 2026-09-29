import ExcelJS from 'exceljs';
import { CategoryRepository } from 'src/modules/category/domain/category.repository';
import { SummaryPeriod } from 'src/modules/parser/domain/parsed-intent';
import { TransactionEntity } from 'src/modules/transaction/domain/transaction.entity';
import { TransactionRepository } from 'src/modules/transaction/domain/transaction.repository';
import { TransactionType } from 'src/shared/domain/enums';
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
});
