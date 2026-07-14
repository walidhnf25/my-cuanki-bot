import { forwardRef, Module } from '@nestjs/common';
import { UserModule } from '../user/user.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { ReminderScheduler } from './application/reminder.scheduler';
import { ReminderService } from './application/reminder.service';
import { ReminderRepository } from './domain/reminder.repository';
import { PrismaReminderRepository } from './infrastructure/prisma-reminder.repository';

@Module({
  imports: [UserModule, forwardRef(() => WhatsappModule)],
  providers: [
    { provide: ReminderRepository, useClass: PrismaReminderRepository },
    ReminderService,
    ReminderScheduler,
  ],
  exports: [ReminderRepository, ReminderService],
})
export class ReminderModule {}
