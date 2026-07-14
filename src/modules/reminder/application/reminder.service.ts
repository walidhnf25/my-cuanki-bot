import { Injectable } from '@nestjs/common';
import { CronExpressionParser } from 'cron-parser';
import { ReminderEntity } from '../domain/reminder.entity';
import { ReminderRepository } from '../domain/reminder.repository';
import { cleanTitle, compileSchedule } from './reminder-schedule.parser';

export interface CreateReminderResult {
  reminder: ReminderEntity;
  humanReadable: string;
}

/**
 * Creates and lists reminders. Compiles the natural-language schedule to cron
 * and computes the next fire time (timezone-aware) via cron-parser.
 */
@Injectable()
export class ReminderService {
  constructor(private readonly reminders: ReminderRepository) {}

  /** Returns null when the schedule phrase can't be understood. */
  async create(
    userId: string,
    rawTitle: string,
    schedulePhrase: string,
    now: Date,
    tz: string,
  ): Promise<CreateReminderResult | null> {
    const compiled = compileSchedule(schedulePhrase);
    if (!compiled) return null;

    const reminder = await this.reminders.create({
      userId,
      title: cleanTitle(rawTitle),
      cronExpression: compiled.cronExpression,
      nextRunAt: this.nextRun(compiled.cronExpression, now, tz),
    });
    return { reminder, humanReadable: compiled.humanReadable };
  }

  list(userId: string): Promise<ReminderEntity[]> {
    return this.reminders.findForUser(userId);
  }

  /** The next fire time for a cron expression, evaluated in the given timezone. */
  nextRun(cronExpression: string, after: Date, tz: string): Date {
    return CronExpressionParser.parse(cronExpression, { currentDate: after, tz }).next().toDate();
  }
}
