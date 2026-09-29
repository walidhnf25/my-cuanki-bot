import { Injectable } from '@nestjs/common';
import { CategoryRepository } from 'src/modules/category/domain/category.repository';
import { DateRangeSpec, SummaryPeriod } from 'src/modules/parser/domain/parsed-intent';
import { TransactionRepository } from 'src/modules/transaction/domain/transaction.repository';
import { TransactionType } from 'src/shared/domain/enums';
import { formatDate } from 'src/shared/utils/date.util';
import { Money } from 'src/shared/utils/money';
import { customRangeInfo, resolvePeriod } from './period';

export interface CsvExport {
  content: Buffer;
  filename: string;
  rowCount: number;
}

const HEADER = ['Tanggal', 'Tipe', 'Jumlah', 'Deskripsi', 'Kategori'];
const UNCATEGORIZED = 'Tanpa Kategori';

/** Escape a CSV field (RFC 4180): quote when it contains a comma/quote/newline. */
function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Neutralise spreadsheet formula injection in free text (=, +, -, @ prefixes). */
function safeText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** "25000.00" -> "25000"; keeps decimals only when non-zero. */
function amountField(m: Money): string {
  return m.toDecimalString().replace(/\.00$/, '');
}

function row(fields: string[]): string {
  return fields.map(csvField).join(',');
}

function percent(part: Money, total: Money): string {
  if (total.isZero()) return '0%';
  const p = Number((part.minorUnits * 1000n) / total.minorUnits) / 10;
  return `${p.toFixed(1).replace(/\.0$/, '')}%`;
}

/** Category breakdown block, largest first. Empty when there is nothing to show. */
function breakdown(title: string, totals: Map<string, Money>, grand: Money): string[] {
  if (totals.size === 0) return [];
  const entries = [...totals.entries()].sort((a, b) => b[1].compareTo(a[1]));
  return [
    '',
    row([title, 'Jumlah', 'Persentase']),
    ...entries.map(([name, sum]) => row([name, amountField(sum), percent(sum, grand)])),
  ];
}

/**
 * Exports a user's transactions for a period to a CSV buffer (UTF-8 with BOM so
 * Excel renders Indonesian text correctly). Rows are sorted by date and followed
 * by a summary block (totals + per-category breakdown) for the exported range.
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
    const { range, slug, label } = customRange
      ? customRangeInfo(customRange, tz)
      : resolvePeriod(period, now, tz);
    const rows = [...(await this.transactions.findManyInRange(userId, range))].sort(
      (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
    );

    const categoryNames = new Map<string, string>();
    for (const id of new Set(rows.map((t) => t.categoryId).filter((id): id is string => !!id))) {
      categoryNames.set(id, (await this.categories.findById(id))?.name ?? '');
    }

    let income = Money.zero();
    let expense = Money.zero();
    const incomeByCat = new Map<string, Money>();
    const expenseByCat = new Map<string, Money>();

    const lines = [row(HEADER)];
    for (const t of rows) {
      const category = (t.categoryId && categoryNames.get(t.categoryId)) || '';
      const isIncome = t.type === TransactionType.INCOME;
      lines.push(
        row([
          formatDate(t.occurredAt, tz),
          isIncome ? 'Pemasukan' : 'Pengeluaran',
          amountField(t.amount),
          safeText(t.description),
          safeText(category),
        ]),
      );

      const bucket = isIncome ? incomeByCat : expenseByCat;
      const key = category || UNCATEGORIZED;
      bucket.set(key, (bucket.get(key) ?? Money.zero()).add(t.amount));
      if (isIncome) income = income.add(t.amount);
      else expense = expense.add(t.amount);
    }

    if (rows.length > 0) {
      lines.push(
        '',
        row(['RINGKASAN']),
        row(['Periode', label]),
        row(['Jumlah Transaksi', String(rows.length)]),
        row(['Total Pemasukan', amountField(income)]),
        row(['Total Pengeluaran', amountField(expense)]),
        row(['Selisih (Pemasukan - Pengeluaran)', amountField(income.subtract(expense))]),
        ...breakdown('Pengeluaran per Kategori', expenseByCat, expense),
        ...breakdown('Pemasukan per Kategori', incomeByCat, income),
      );
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
