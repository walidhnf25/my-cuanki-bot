import { cleanTitle, compileSchedule } from './reminder-schedule.parser';

describe('compileSchedule', () => {
  it('compiles a monthly "tiap tanggal N"', () => {
    const r = compileSchedule('bayar listrik tiap tanggal 5');
    expect(r?.cronExpression).toBe('0 8 5 * *');
    expect(r?.humanReadable).toContain('tanggal 5');
  });

  it('honors an explicit time', () => {
    const r = compileSchedule('tiap tanggal 5 jam 19:30');
    expect(r?.cronExpression).toBe('30 19 5 * *');
  });

  it('compiles a weekly weekday', () => {
    const r = compileSchedule('olahraga tiap senin');
    expect(r?.cronExpression).toBe('0 8 * * 1');
    expect(r?.humanReadable).toContain('Senin');
  });

  it('compiles a daily reminder', () => {
    expect(compileSchedule('minum obat tiap hari jam 7')?.cronExpression).toBe('0 7 * * *');
  });

  it('treats a bare time as daily', () => {
    expect(compileSchedule('jam 6 pagi')?.cronExpression).toBe('0 6 * * *');
  });

  it('returns null when no schedule is present', () => {
    expect(compileSchedule('bayar listrik')).toBeNull();
  });
});

describe('cleanTitle', () => {
  it('strips schedule and command words', () => {
    expect(cleanTitle('ingatkan bayar listrik tiap tanggal 5')).toBe('bayar listrik');
  });

  it('strips time words and weekday', () => {
    expect(cleanTitle('olahraga tiap senin jam 6')).toBe('olahraga');
  });

  it('falls back to a default title', () => {
    expect(cleanTitle('tiap hari jam 8')).toBe('Pengingat');
  });
});
