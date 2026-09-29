import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
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
  mimeType: string;
  rowCount: number;
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const UNCATEGORIZED = 'Tanpa Kategori';
const RUPIAH_FORMAT = '"Rp"#,##0;[Red]-"Rp"#,##0';

const COLOR = {
  primary: 'FF1F4E79',
  headerText: 'FFFFFFFF',
  stripe: 'FFF2F7FB',
  border: 'FFD0D7DE',
  income: 'FF1E7B34',
  incomeBg: 'FFE6F4EA',
  expense: 'FFB3261E',
  expenseBg: 'FFFCE8E6',
  muted: 'FF5F6B76',
} as const;

const thin = { style: 'thin', color: { argb: COLOR.border } } as const;
const BORDER: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };

function fill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function styleHeader(row: ExcelJS.Row): void {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLOR.headerText } };
    cell.fill = fill(COLOR.primary);
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = BORDER;
  });
}

function addTitle(sheet: ExcelJS.Worksheet, title: string, subtitle: string, cols: number): void {
  const last = String.fromCharCode(64 + cols);
  sheet.mergeCells(`A1:${last}1`);
  sheet.mergeCells(`A2:${last}2`);
  const t = sheet.getCell('A1');
  t.value = title;
  t.font = { bold: true, size: 16, color: { argb: COLOR.primary } };
  t.alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 26;
  const s = sheet.getCell('A2');
  s.value = subtitle;
  s.font = { italic: true, color: { argb: COLOR.muted } };
}

function toRupiah(m: Money): number {
  return m.toNumber();
}

/** Category breakdown table, largest first. Returns the next free row number. */
function addBreakdown(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  title: string,
  totals: Map<string, Money>,
  grand: Money,
  accent: string,
): number {
  if (totals.size === 0) return startRow;
  const header = sheet.getRow(startRow);
  header.values = [title, 'Jumlah', 'Persentase'];
  styleHeader(header);
  header.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
  header.getCell(1).fill = fill(accent);
  header.getCell(2).fill = fill(accent);
  header.getCell(3).fill = fill(accent);

  const entries = [...totals.entries()].sort((a, b) => b[1].compareTo(a[1]));
  let r = startRow + 1;
  for (const [name, sum] of entries) {
    const share = grand.isZero() ? 0 : Number((sum.minorUnits * 10000n) / grand.minorUnits) / 10000;
    const row = sheet.getRow(r);
    row.values = [name, toRupiah(sum), share];
    row.getCell(2).numFmt = RUPIAH_FORMAT;
    row.getCell(3).numFmt = '0.0%';
    row.eachCell((c) => (c.border = BORDER));
    if ((r - startRow) % 2 === 0) row.eachCell((c) => (c.fill = fill(COLOR.stripe)));
    r++;
  }
  return r + 1;
}

/**
 * Exports a user's transactions for a period to a formatted Excel workbook (.xlsx):
 * a "Transaksi" sheet (sorted by date) and a "Ringkasan" sheet with totals and
 * per-category breakdown for the exported range.
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

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Cuanki';
    wb.created = now;

    // ---- Sheet 1: Transaksi ----
    const tx = wb.addWorksheet('Transaksi', { views: [{ state: 'frozen', ySplit: 4 }] });
    tx.columns = [
      { key: 'date', width: 13 },
      { key: 'type', width: 14 },
      { key: 'amount', width: 18 },
      { key: 'desc', width: 34 },
      { key: 'cat', width: 20 },
    ];
    addTitle(tx, 'Laporan Transaksi', `Periode: ${label}`, 5);
    const header = tx.getRow(4);
    header.values = ['Tanggal', 'Tipe', 'Jumlah', 'Deskripsi', 'Kategori'];
    styleHeader(header);

    let income = Money.zero();
    let expense = Money.zero();
    const incomeByCat = new Map<string, Money>();
    const expenseByCat = new Map<string, Money>();

    rows.forEach((t, i) => {
      const category = (t.categoryId && categoryNames.get(t.categoryId)) || '';
      const isIncome = t.type === TransactionType.INCOME;
      const row = tx.getRow(5 + i);
      row.values = [
        formatDate(t.occurredAt, tz),
        isIncome ? 'Pemasukan' : 'Pengeluaran',
        toRupiah(t.amount),
        t.description,
        category || UNCATEGORIZED,
      ];
      row.getCell(1).alignment = { horizontal: 'center' };
      row.getCell(2).alignment = { horizontal: 'center' };
      row.getCell(2).font = {
        bold: true,
        color: { argb: isIncome ? COLOR.income : COLOR.expense },
      };
      row.getCell(3).numFmt = RUPIAH_FORMAT;
      row.eachCell((c) => {
        c.border = BORDER;
        if (i % 2 === 1) c.fill = fill(COLOR.stripe);
      });

      const bucket = isIncome ? incomeByCat : expenseByCat;
      const key = category || UNCATEGORIZED;
      bucket.set(key, (bucket.get(key) ?? Money.zero()).add(t.amount));
      if (isIncome) income = income.add(t.amount);
      else expense = expense.add(t.amount);
    });
    if (rows.length > 0) {
      tx.autoFilter = { from: 'A4', to: `E${4 + rows.length}` };
    }

    // ---- Sheet 2: Ringkasan ----
    const sum = wb.addWorksheet('Ringkasan');
    sum.columns = [{ width: 30 }, { width: 20 }, { width: 14 }];
    addTitle(sum, 'Ringkasan Keuangan', `Periode: ${label}`, 3);

    const balance = income.subtract(expense);
    const cards: [string, string | number, string, string, string?][] = [
      ['Jumlah Transaksi', rows.length, COLOR.primary, COLOR.stripe],
      ['Total Pemasukan', toRupiah(income), COLOR.income, COLOR.incomeBg, RUPIAH_FORMAT],
      ['Total Pengeluaran', toRupiah(expense), COLOR.expense, COLOR.expenseBg, RUPIAH_FORMAT],
      [
        'Selisih (Pemasukan - Pengeluaran)',
        toRupiah(balance),
        balance.isNegative() ? COLOR.expense : COLOR.income,
        balance.isNegative() ? COLOR.expenseBg : COLOR.incomeBg,
        RUPIAH_FORMAT,
      ],
    ];
    cards.forEach(([name, value, color, bg, fmt], i) => {
      const row = sum.getRow(4 + i);
      row.values = [name, value];
      row.height = 22;
      sum.mergeCells(`B${4 + i}:C${4 + i}`);
      row.eachCell((c) => {
        c.fill = fill(bg);
        c.border = BORDER;
        c.alignment = { vertical: 'middle' };
      });
      row.getCell(1).font = { bold: true };
      row.getCell(2).font = { bold: true, size: 12, color: { argb: color } };
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
      if (fmt) row.getCell(2).numFmt = fmt;
    });

    let next = 9;
    next = addBreakdown(
      sum,
      next,
      'Pengeluaran per Kategori',
      expenseByCat,
      expense,
      COLOR.expense,
    );
    addBreakdown(sum, next, 'Pemasukan per Kategori', incomeByCat, income, COLOR.income);

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return {
      content: buffer,
      filename: `transaksi-${slug}.xlsx`,
      mimeType: XLSX_MIME,
      rowCount: rows.length,
    };
  }
}
