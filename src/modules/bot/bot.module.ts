import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BudgetModule } from '../budget/budget.module';
import { ConversationModule } from '../conversation/conversation.module';
import { ParserModule } from '../parser/parser.module';
import { ReportModule } from '../report/report.module';
import { TransactionModule } from '../transaction/transaction.module';
import { UserModule } from '../user/user.module';
import { IncomingMessageHandler } from './application/incoming-message.handler';
import { MessageDedupeService } from './application/message-dedupe.service';
import { MessageOrchestrator } from './application/message-orchestrator';
import { ReplyBuilder } from './application/reply-builder';
import { MessagingGateway } from './domain/messaging.gateway.port';
import { TelegramWebhookController } from './infrastructure/telegram-webhook.controller';
import { TelegramGateway } from './infrastructure/telegram.gateway';
import { TelegramPoller } from './infrastructure/telegram.poller';

/**
 * Chat delivery module. Binds the MessagingGateway port to Telegram, exposes
 * the webhook endpoint and wires the inbound orchestrator (parsing,
 * conversation state, actions).
 */
@Module({
  imports: [
    UserModule,
    ParserModule,
    AuditModule,
    TransactionModule,
    ConversationModule,
    BudgetModule,
    ReportModule,
  ],
  controllers: [TelegramWebhookController],
  providers: [
    TelegramGateway,
    { provide: MessagingGateway, useExisting: TelegramGateway },
    TelegramPoller,
    MessageDedupeService,
    ReplyBuilder,
    MessageOrchestrator,
    IncomingMessageHandler,
  ],
  exports: [MessagingGateway],
})
export class BotModule {}
