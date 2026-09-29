/**
 * Spreadsheet layout: one tab per table, row 1 holds these column headers and
 * every following row is a record. Column order is the contract — append new
 * columns at the end so existing data keeps lining up.
 */
export const SHEET_COLUMNS = {
  users: [
    'id',
    'telegram_id',
    'chat_id',
    'display_name',
    'currency',
    'timezone',
    'is_onboarded',
    'created_at',
    'updated_at',
    'default_wallet',
    'opening_cash',
    'opening_digital',
  ],
  categories: ['id', 'user_id', 'name', 'type', 'icon', 'is_system', 'keywords', 'created_at'],
  transactions: [
    'id',
    'user_id',
    'category_id',
    'type',
    'amount',
    'description',
    'note',
    'occurred_at',
    'source_message',
    'message_id',
    'deleted_at',
    'created_at',
    'updated_at',
    'wallet',
  ],
  budgets: [
    'id',
    'user_id',
    'category_id',
    'amount',
    'period',
    'alert_threshold',
    'created_at',
    'updated_at',
  ],
  conversations: ['id', 'user_id', 'state', 'payload', 'expires_at', 'created_at', 'updated_at'],
} as const;

export type SheetName = keyof typeof SHEET_COLUMNS;

export const SHEET_NAMES = Object.keys(SHEET_COLUMNS) as SheetName[];

/** A cell value as read with `UNFORMATTED_VALUE` / written with `RAW`. */
export type Cell = string | number | boolean | null;

export type SheetRecord = Record<string, Cell>;

export interface SheetRow {
  /** 1-based spreadsheet row number (row 1 is the header). */
  rowNumber: number;
  data: SheetRecord;
}

/** Spreadsheet column letter for a 1-based index (1 -> A). Tables stay under 26 columns. */
export function columnLetter(index: number): string {
  return String.fromCharCode(64 + index);
}

/** Map a raw row (array of cells, trailing blanks omitted by the API) onto column names. */
export function rowToRecord(sheet: SheetName, values: Cell[]): SheetRecord {
  const record: SheetRecord = {};
  SHEET_COLUMNS[sheet].forEach((column, i) => {
    const value = values[i];
    record[column] = value === undefined || value === '' ? null : value;
  });
  return record;
}

/** Order a record's values by the sheet's columns; missing values become blank cells. */
export function recordToRow(sheet: SheetName, record: SheetRecord): Cell[] {
  return SHEET_COLUMNS[sheet].map((column) => record[column] ?? '');
}
