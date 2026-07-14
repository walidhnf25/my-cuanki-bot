import { Injectable } from '@nestjs/common';
import { CategoryRepository } from 'src/modules/category/domain/category.repository';
import { DateRangeSpec, SummaryPeriod } from 'src/modules/parser/domain/parsed-intent';
import { TransactionRepository } from 'src/modules/transaction/domain/transaction.repository';
import { TransactionType } from 'src/shared/domain/enums';
import { formatDate } from 'src/shared/utils/date.util';
import { customRangeInfo, resolvePeriod } from './period';

export interface CsvExport {
  content: Buffer;
  filename: string;
  rowCount: number;
}

const HEADER = ['Tanggal', 'Tipe', 'Jumlah', 'Deskripsi', 'Kategori'];

/** Escape a CSV field (RFC 4180): quote when it contains a comma/quote/newline. */
function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Exports a user's transactions for a period to a CSV buffer (UTF-8 with BOM so
 * Excel renders Indonesian text correctly).
 */
@Injectable()
export class CsvExportService {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly categories: CategoryRepository,
  ) {}

  async export(
    userId: string,
    period: SummaryPeriod,
    now: Date,
    tz: string,
    customRange?: DateRangeSpec,
  ): Promise<CsvExport> {
    const { range, slug } = customRange
      ? customRangeInfo(customRange, tz)
      : resolvePeriod(period, now, tz);
    const rows = await this.transactions.findManyInRange(userId, range);

    const lines = [HEADER.join(',')];
    for (const t of rows) {
      const category = t.categoryId ? await this.categories.findById(t.categoryId) : null;
      const record = [
        formatDate(t.occurredAt, tz),
        t.type === TransactionType.INCOME ? 'Pemasukan' : 'Pengeluaran',
        t.amount.toDecimalString(),
        t.description,
        category?.name ?? '',
      ];
      lines.push(record.map(csvField).join(','));
    }

    // UTF-8 BOM (U+FEFF) so Excel detects the encoding correctly.
    const bom = String.fromCharCode(0xfeff);
    const csv = bom + lines.join('\r\n');
    return {
      content: Buffer.from(csv, 'utf-8'),
      filename: `transaksi-${slug}.csv`,
      rowCount: rows.length,
    };
  }
}
