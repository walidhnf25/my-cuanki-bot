import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceAccountAuth } from './service-account-auth';
import {
  Cell,
  columnLetter,
  recordToRow,
  rowToRecord,
  SHEET_COLUMNS,
  SHEET_NAMES,
  SheetName,
  SheetRecord,
  SheetRow,
} from './sheets.schema';

const API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
/**
 * Reads of the same tab within this window reuse the previous result, so one
 * inbound message (which touches the same tabs several times) costs a single
 * API read per tab. Writes from this instance invalidate the tab immediately.
 */
const CACHE_TTL_MS = 5_000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503]);
const MAX_ATTEMPTS = 3;

export interface RowDeletion {
  sheet: SheetName;
  rowNumbers: number[];
}

/**
 * Thin Google Sheets REST client that treats each tab as a table (see
 * {@link SHEET_COLUMNS}). Repositories build on this; nothing else in the
 * domain knows the data lives in a spreadsheet.
 */
@Injectable()
export class SheetsClient implements OnModuleInit {
  private readonly logger = new Logger(SheetsClient.name);
  private readonly auth: ServiceAccountAuth;
  private readonly spreadsheetId: string;
  private readonly cache = new Map<SheetName, { rows: SheetRow[]; at: number }>();
  private sheetIds: Map<string, number> | null = null;

  constructor(config: ConfigService) {
    this.spreadsheetId = config.getOrThrow<string>('sheets.spreadsheetId');
    this.auth = new ServiceAccountAuth(
      config.getOrThrow<string>('sheets.clientEmail'),
      config.getOrThrow<string>('sheets.privateKey'),
    );
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureSchema();
    } catch (err) {
      // Non-fatal so the app still boots; requests will surface the real error.
      this.logger.error({ err }, 'Could not verify the spreadsheet layout');
    }
  }

  /** All data rows of a tab (header excluded; rows without an id are skipped). */
  async getRows(sheet: SheetName): Promise<SheetRow[]> {
    const cached = this.cache.get(sheet);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.rows;

    const range = `${sheet}!A2:${columnLetter(SHEET_COLUMNS[sheet].length)}`;
    const res = await this.request<{ values?: Cell[][] }>(
      'GET',
      `/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`,
    );
    const rows = (res.values ?? [])
      .map((values, i) => ({ rowNumber: i + 2, data: rowToRecord(sheet, values) }))
      .filter((row) => row.data.id !== null);

    this.cache.set(sheet, { rows, at: Date.now() });
    return rows;
  }

  async append(sheet: SheetName, records: SheetRecord[]): Promise<void> {
    if (records.length === 0) return;
    this.cache.delete(sheet);
    const range = encodeURIComponent(`${sheet}!A1`);
    await this.request(
      'POST',
      `/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { values: records.map((r) => recordToRow(sheet, r)) },
    );
  }

  async update(sheet: SheetName, rowNumber: number, record: SheetRecord): Promise<void> {
    this.cache.delete(sheet);
    const last = columnLetter(SHEET_COLUMNS[sheet].length);
    const range = encodeURIComponent(`${sheet}!A${rowNumber}:${last}${rowNumber}`);
    await this.request('PUT', `/values/${range}?valueInputOption=RAW`, {
      values: [recordToRow(sheet, record)],
    });
  }

  /** Physically delete rows (across tabs) in one atomic batchUpdate. */
  async deleteRows(deletions: RowDeletion[]): Promise<void> {
    const sheetIds = await this.getSheetIds();
    const requests = deletions.flatMap(({ sheet, rowNumbers }) => {
      this.cache.delete(sheet);
      // Bottom-up so earlier deletions don't shift the rows still to delete.
      return [...rowNumbers]
        .sort((a, b) => b - a)
        .map((rowNumber) => ({
          deleteDimension: {
            range: {
              sheetId: sheetIds.get(sheet),
              dimension: 'ROWS',
              startIndex: rowNumber - 1,
              endIndex: rowNumber,
            },
          },
        }));
    });
    if (requests.length === 0) return;
    await this.request('POST', ':batchUpdate', { requests });
  }

  /** Connectivity probe for the health check. */
  async ping(): Promise<void> {
    await this.request('GET', '?fields=spreadsheetId');
  }

  /** Create any missing tab with its header row. Costs one read when all tabs exist. */
  async ensureSchema(): Promise<void> {
    const sheetIds = await this.getSheetIds(true);
    const missing = SHEET_NAMES.filter((name) => !sheetIds.has(name));
    if (missing.length === 0) return;

    await this.request('POST', ':batchUpdate', {
      requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
    });
    await this.request('POST', '/values:batchUpdate', {
      valueInputOption: 'RAW',
      data: missing.map((sheet) => ({
        range: `${sheet}!A1`,
        values: [[...SHEET_COLUMNS[sheet]]],
      })),
    });
    this.sheetIds = null;
    this.logger.log(`Created missing sheet tabs: ${missing.join(', ')}`);
  }

  // ---- Internal ----

  private async getSheetIds(refresh = false): Promise<Map<string, number>> {
    if (this.sheetIds && !refresh) return this.sheetIds;
    const res = await this.request<{
      sheets?: Array<{ properties: { sheetId: number; title: string } }>;
    }>('GET', '?fields=sheets.properties(sheetId,title)');
    this.sheetIds = new Map(
      (res.sheets ?? []).map((s) => [s.properties.title, s.properties.sheetId]),
    );
    return this.sheetIds;
  }

  private async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${API_BASE}/${this.spreadsheetId}${path}`;

    for (let attempt = 1; ; attempt++) {
      const token = await this.auth.getAccessToken();
      const res = await fetch(url, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      if (res.ok) return (await res.json()) as T;

      if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_ATTEMPTS) {
        const delay = attempt * 1000;
        this.logger.warn(`Sheets API ${res.status}; retrying in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      throw new Error(`Sheets API ${method} ${path} failed (${res.status}): ${await res.text()}`);
    }
  }
}
