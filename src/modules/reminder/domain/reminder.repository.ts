import { CreateReminderInput, ReminderEntity, UpdateReminderInput } from './reminder.entity';

export abstract class ReminderRepository {
  abstract create(input: CreateReminderInput): Promise<ReminderEntity>;

  /** Active reminders whose nextRunAt is due (<= now). */
  abstract findDue(now: Date): Promise<ReminderEntity[]>;

  abstract findForUser(userId: string): Promise<ReminderEntity[]>;

  abstract update(id: string, patch: UpdateReminderInput): Promise<ReminderEntity>;

  abstract deactivate(id: string): Promise<void>;
}
