import type { Reminder as PrismaReminder } from '@prisma/client';
import { ReminderEntity } from '../domain/reminder.entity';

export function toReminderEntity(row: PrismaReminder): ReminderEntity {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    cronExpression: row.cronExpression,
    nextRunAt: row.nextRunAt,
    isActive: row.isActive,
    lastSentAt: row.lastSentAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
