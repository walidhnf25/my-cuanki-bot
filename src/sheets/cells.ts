import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { DEFAULT_TIMEZONE } from 'src/shared/utils/date.util';
import { Wallet } from 'src/shared/domain/enums';
import { Money } from 'src/shared/utils/money';
import { Cell } from './sheets.schema';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Converters between domain values and spreadsheet cells. Reads are lenient
 * because people can edit the sheet by hand: blanks become null and plain
 * numbers stored as text are still accepted.
 */

export function cellString(value: Cell | undefined): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

export function cellRequiredString(value: Cell | undefined, fallback = ''): string {
  return cellString(value) ?? fallback;
}

export function cellNumber(value: Cell | undefined): number | null {
  if (typeof value === 'number') return value;
  const s = cellString(value);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function cellBoolean(value: Cell | undefined): boolean {
  if (typeof value === 'boolean') return value;
  const s = cellString(value)?.toLowerCase();
  return s === 'true' || s === '1' || s === 'ya';
}

export function cellMoney(value: Cell | undefined): Money {
  const n = cellNumber(value);
  return n === null ? Money.zero() : Money.fromMajor(n);
}

/** Blank or unrecognised => null (callers treat null as the legacy CASH wallet). */
export function cellWallet(value: Cell | undefined): Wallet | null {
  const s = cellString(value)?.toUpperCase();
  return s === Wallet.CASH || s === Wallet.DIGITAL ? s : null;
}

export function cellOptionalMoney(value: Cell | undefined): Money | null {
  const n = cellNumber(value);
  return n === null ? null : Money.fromMajor(n);
}

export function cellDate(value: Cell | undefined): Date | null {
  const s = cellString(value);
  if (s === null) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Stored as a plain number so the sheet can SUM it. */
export function moneyCell(money: Money): number {
  return money.toNumber();
}

/**
 * ISO-8601 with the local offset (e.g. `2026-09-28T10:15:00.000+07:00`): still
 * an exact instant for the app, but readable when browsing the sheet.
 */
export function dateCell(date: Date | null | undefined): string {
  return date ? dayjs(date).tz(DEFAULT_TIMEZONE).format('YYYY-MM-DDTHH:mm:ss.SSSZ') : '';
}
