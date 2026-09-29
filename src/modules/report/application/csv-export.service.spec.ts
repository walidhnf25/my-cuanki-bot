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

describe('CsvExportService', () => {
  let transactions: jest.Mocked<TransactionRepository>;
  let categories: jest.Mocked<CategoryRepository>;
  let service: CsvExportService;

  beforeEach(() => {
    transactions = {
      findManyInRange: jest.fn(),
    } as unknown as jest.Mocked<TransactionRepository>;
    categories = { findById: jest.fn() } as unknown as jest.Mocked<CategoryRepository>;
    service = new CsvExportService(transactions, categories);
  });

  it('builds a CSV with header and rows', async () => {
    transactions.findManyInRange.mockResolvedValue([
      tx({ description: 'kopi susu', amount: Money.fromMajor(25000) }),
    ]);
    categories.findById.mockResolvedValue({ name: 'Makanan' } as never);

    const csv = await service.export('u1', SummaryPeriod.Month, new Date(), 'Asia/Jakarta');
    const text = csv.content.toString('utf-8');

    expect(csv.rowCount).toBe(1);
    expect(csv.filename).toBe('transaksi-bulan-ini.csv');
    expect(text).toContain('Tanggal,Tipe,Jumlah,Deskripsi,Kategori');
    expect(text).toContain('15/07/2026,Pengeluaran,25000,kopi susu,Makanan');
  });

  it('quotes fields containing a comma', async () => {
    transactions.findManyInRange.mockResolvedValue([tx({ description: 'nasi, ayam' })]);
    categories.findById.mockResolvedValue(null);

    const csv = await service.export('u1', SummaryPeriod.Month, new Date(), 'Asia/Jakarta');
    expect(csv.content.toString('utf-8')).toContain('"nasi, ayam"');
  });

  it('appends a summary with totals and per-category breakdown', async () => {
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

    const csv = await service.export('u1', SummaryPeriod.Month, new Date(), 'Asia/Jakarta');
    const text = csv.content.toString('utf-8');

    expect(text).toContain('RINGKASAN');
    expect(text).toContain('Jumlah Transaksi,3');
    expect(text).toContain('Total Pemasukan,100000');
    expect(text).toContain('Total Pengeluaran,100000');
    expect(text).toContain('Selisih (Pemasukan - Pengeluaran),0');
    expect(text).toContain('Makanan,100000,100%');
    expect(text).toContain('Tanpa Kategori,100000,100%');
    expect(categories.findById).toHaveBeenCalledTimes(1);
  });

  it('neutralises formula injection and omits summary when empty', async () => {
    transactions.findManyInRange.mockResolvedValue([tx({ description: '=HYPERLINK("x")' })]);
    categories.findById.mockResolvedValue(null);
    let text = (
      await service.export('u1', SummaryPeriod.Month, new Date(), 'Asia/Jakarta')
    ).content.toString('utf-8');
    expect(text).toContain(`"'=HYPERLINK(""x"")"`);

    transactions.findManyInRange.mockResolvedValue([]);
    text = (
      await service.export('u1', SummaryPeriod.Month, new Date(), 'Asia/Jakarta')
    ).content.toString('utf-8');
    expect(text).not.toContain('RINGKASAN');
  });
});
