import { ConfigService } from '@nestjs/config';
import { SheetsClient } from './sheets.client';
import { SHEET_COLUMNS, SHEET_NAMES } from './sheets.schema';

type RequestFn = (method: string, path: string, body?: unknown) => Promise<unknown>;

const LEGACY_LENGTH = { users: 9, transactions: 13 } as const;

function makeClient(headers: Record<string, string[]>): {
  client: SheetsClient;
  calls: Array<{ method: string; path: string; body?: unknown }>;
} {
  const config = {
    getOrThrow: (key: string) => (key === 'sheets.spreadsheetId' ? 'sheet-id' : 'x'),
  } as unknown as ConfigService;
  const client = new SheetsClient(config);
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];

  const request: RequestFn = (method, path, body) => {
    calls.push({ method, path, body });
    if (path.startsWith('?fields=')) {
      return Promise.resolve({
        sheets: SHEET_NAMES.map((title, i) => ({ properties: { title, sheetId: i } })),
      });
    }
    if (path.startsWith('/values:batchGet')) {
      return Promise.resolve({
        valueRanges: SHEET_NAMES.map((name) => ({
          values: [headers[name] ?? [...SHEET_COLUMNS[name]]],
        })),
      });
    }
    return Promise.resolve({});
  };
  (client as unknown as { request: RequestFn }).request = request;
  return { client, calls };
}

describe('SheetsClient.ensureSchema', () => {
  it('appends headers for columns added after the tab was created', async () => {
    const { client, calls } = makeClient({
      users: SHEET_COLUMNS.users.slice(0, LEGACY_LENGTH.users) as unknown as string[],
      transactions: SHEET_COLUMNS.transactions.slice(
        0,
        LEGACY_LENGTH.transactions,
      ) as unknown as string[],
    });

    await client.ensureSchema();

    const update = calls.find((c) => c.path === '/values:batchUpdate');
    expect(update?.body).toEqual({
      valueInputOption: 'RAW',
      data: [
        {
          range: 'users!J1',
          values: [['default_wallet', 'opening_cash', 'opening_digital', 'wallet_mode']],
        },
        { range: 'transactions!N1', values: [['wallet']] },
      ],
    });
  });

  it('adds only the newest header to a tab that already has the earlier wallet columns', async () => {
    const { client, calls } = makeClient({
      users: SHEET_COLUMNS.users.slice(0, 12) as unknown as string[],
    });

    await client.ensureSchema();

    const update = calls.find((c) => c.path === '/values:batchUpdate');
    expect(update?.body).toEqual({
      valueInputOption: 'RAW',
      data: [{ range: 'users!M1', values: [['wallet_mode']] }],
    });
  });

  it('writes nothing when every header is already present', async () => {
    const { client, calls } = makeClient({});
    await client.ensureSchema();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('never overwrites a hand-edited header row', async () => {
    const edited = [...SHEET_COLUMNS.transactions.slice(0, 13)] as string[];
    edited[2] = 'kategori';
    const { client, calls } = makeClient({ transactions: edited });

    await client.ensureSchema();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });
});
