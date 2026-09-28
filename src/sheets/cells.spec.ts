import { Money } from 'src/shared/utils/money';
import { cellBoolean, cellDate, cellMoney, cellNumber, cellString, dateCell } from './cells';
import { recordToRow, rowToRecord } from './sheets.schema';

describe('cells', () => {
  it('treats blanks as null', () => {
    expect(cellString('')).toBeNull();
    expect(cellString('  ')).toBeNull();
    expect(cellString(null)).toBeNull();
    expect(cellNumber('')).toBeNull();
    expect(cellDate('')).toBeNull();
  });

  it('reads numbers stored as numbers or text', () => {
    expect(cellNumber(25000)).toBe(25000);
    expect(cellNumber('25000')).toBe(25000);
    expect(cellNumber('abc')).toBeNull();
    expect(cellMoney(25000.5).equals(Money.fromMajor('25000.50'))).toBe(true);
    expect(cellMoney(null).isZero()).toBe(true);
  });

  it('reads booleans from sheet values or text', () => {
    expect(cellBoolean(true)).toBe(true);
    expect(cellBoolean('TRUE')).toBe(true);
    expect(cellBoolean(false)).toBe(false);
    expect(cellBoolean(null)).toBe(false);
  });

  it('round-trips dates through the local-offset ISO format', () => {
    const date = new Date('2026-09-28T03:15:00.123Z');
    const cell = dateCell(date);
    expect(cell).toBe('2026-09-28T10:15:00.123+07:00');
    expect(cellDate(cell)?.getTime()).toBe(date.getTime());
    expect(dateCell(null)).toBe('');
  });
});

describe('sheet rows', () => {
  it('maps a short row (trailing blanks omitted by the API) onto all columns', () => {
    const record = rowToRecord('budgets', ['b1', 'u1', '', 500000]);
    expect(record).toEqual({
      id: 'b1',
      user_id: 'u1',
      category_id: null,
      amount: 500000,
      period: null,
      alert_threshold: null,
      created_at: null,
      updated_at: null,
    });
  });

  it('orders record values by column and blanks missing ones', () => {
    expect(recordToRow('conversations', { user_id: 'u1', id: 'c1', state: 'IDLE' })).toEqual([
      'c1',
      'u1',
      'IDLE',
      '',
      '',
      '',
      '',
    ]);
  });
});
