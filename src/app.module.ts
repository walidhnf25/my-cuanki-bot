import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { CoreModule } from './common/core.module';
import { LoggerModule } from './common/logger/logger.module';
import { AppConfigModule } from './config/app-config.module';
import { PrismaModule } from './database/prisma.module';
import { AuditModule } from './modules/audit/audit.module';
import { BudgetModule } from './modules/budget/budget.module';
import { CategoryModule } from './modules/category/category.module';
import { ConversationModule } from './modules/conversation/conversation.module';
import { HealthModule } from './modules/health/health.module';
import { ParserModule } from './modules/parser/parser.module';
import { ReminderModule } from './modules/reminder/reminder.module';
import { TransactionModule } from './modules/transaction/transaction.module';
import { UserModule } from './modules/user/user.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';

/**
 * Root module. Wires global cross-cutting concerns (config, logging, db),
 * the persistence modules (repository ports), and feature modules. Service /
 * use-case layers and the WhatsApp + parser modules are added in later phases.
 */
@Module({
  imports: [
    // Infrastructure & cross-cutting
    AppConfigModule,
    LoggerModule,
    CoreModule,
    PrismaModule,
    ScheduleModule.forRoot(),
    // Persistence (Phase 4)
    UserModule,
    CategoryModule,
    TransactionModule,
    BudgetModule,
    ReminderModule,
    ConversationModule,
    AuditModule,
    // Business logic
    ParserModule,
    // Delivery
    WhatsappModule,
    // Ops
    HealthModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
