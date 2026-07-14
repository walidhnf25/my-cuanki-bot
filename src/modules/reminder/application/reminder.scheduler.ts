import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UserRepository } from 'src/modules/user/domain/user.repository';
import { MessagingGateway } from 'src/modules/whatsapp/domain/messaging.gateway.port';
import { DEFAULT_TIMEZONE } from 'src/shared/utils/date.util';
import { ReminderRepository } from '../domain/reminder.repository';
import { ReminderService } from './reminder.service';

/**
 * Polls for due reminders every minute and delivers them over WhatsApp, then
 * reschedules each to its next occurrence. MVP single-instance design; a
 * distributed queue (BullMQ) would replace this when scaling out.
 */
@Injectable()
export class ReminderScheduler {
  private readonly logger = new Logger(ReminderScheduler.name);

  constructor(
    private readonly reminders: ReminderRepository,
    private readonly reminderService: ReminderService,
    private readonly users: UserRepository,
    private readonly gateway: MessagingGateway,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (!this.gateway.isConnected()) return;

    const now = new Date();
    const due = await this.reminders.findDue(now);
    if (due.length === 0) return;

    for (const reminder of due) {
      try {
        const user = await this.users.findById(reminder.userId);
        const to = user?.chatJid ?? (user ? `${user.waNumber}@s.whatsapp.net` : null);
        if (to) {
          await this.gateway.sendText(to, `⏰ *Pengingat:* ${reminder.title}`);
        }
        const tz = user?.timezone ?? DEFAULT_TIMEZONE;
        const nextRunAt = this.reminderService.nextRun(reminder.cronExpression, now, tz);
        await this.reminders.update(reminder.id, { nextRunAt, lastSentAt: now });
      } catch (err) {
        this.logger.error({ err, reminderId: reminder.id }, 'Failed to deliver reminder');
      }
    }
  }
}
