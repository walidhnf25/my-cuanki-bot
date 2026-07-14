import { toIsoDate } from 'src/shared/utils/date.util';
import { ReminderEntity } from '../domain/reminder.entity';
import { ReminderRepository } from '../domain/reminder.repository';
import { ReminderService } from './reminder.service';

const TZ = 'Asia/Jakarta';

function reminder(over: Partial<ReminderEntity> = {}): ReminderEntity {
  return {
    id: 'r1',
    userId: 'u1',
    title: 'bayar listrik',
    cronExpression: '0 8 5 * *',
    nextRunAt: new Date(),
    isActive: true,
    lastSentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

describe('ReminderService', () => {
  let reminders: jest.Mocked<ReminderRepository>;
  let service: ReminderService;

  beforeEach(() => {
    reminders = {
      create: jest.fn(),
      findDue: jest.fn(),
      findForUser: jest.fn(),
      update: jest.fn(),
      deactivate: jest.fn(),
    } as unknown as jest.Mocked<ReminderRepository>;
    service = new ReminderService(reminders);
  });

  it('creates a reminder from a schedule phrase', async () => {
    reminders.create.mockResolvedValue(reminder());
    const now = new Date('2026-07-13T00:00:00.000Z');

    const result = await service.create(
      'u1',
      'ingatkan bayar listrik tiap tanggal 5',
      'ingatkan bayar listrik tiap tanggal 5',
      now,
      TZ,
    );

    expect(reminders.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        title: 'bayar listrik',
        cronExpression: '0 8 5 * *',
        nextRunAt: expect.any(Date),
      }),
    );
    expect(result?.humanReadable).toContain('tanggal 5');
  });

  it('returns null when the schedule cannot be parsed', async () => {
    const result = await service.create('u1', 'bayar listrik', 'bayar listrik', new Date(), TZ);
    expect(result).toBeNull();
    expect(reminders.create).not.toHaveBeenCalled();
  });

  it('computes the next run time in the timezone', () => {
    // From 2026-07-13, the next "day-5 at 08:00" is 2026-08-05.
    const next = service.nextRun('0 8 5 * *', new Date('2026-07-13T00:00:00.000Z'), TZ);
    expect(toIsoDate(next, TZ)).toBe('2026-08-05');
  });
});
