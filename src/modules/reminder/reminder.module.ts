import { Module } from '@nestjs/common';
import { ReminderRepository } from './domain/reminder.repository';
import { PrismaReminderRepository } from './infrastructure/prisma-reminder.repository';

@Module({
  providers: [{ provide: ReminderRepository, useClass: PrismaReminderRepository }],
  exports: [ReminderRepository],
})
export class ReminderModule {}
