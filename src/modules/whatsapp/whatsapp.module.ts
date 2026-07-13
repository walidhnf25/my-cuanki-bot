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
import { BaileysGateway } from './infrastructure/baileys.gateway';

/**
 * WhatsApp delivery module. Binds the MessagingGateway port to Baileys and wires
 * the inbound orchestrator (parsing, conversation state, actions).
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
  providers: [
    { provide: MessagingGateway, useClass: BaileysGateway },
    MessageDedupeService,
    ReplyBuilder,
    MessageOrchestrator,
    IncomingMessageHandler,
  ],
  exports: [MessagingGateway],
})
export class WhatsappModule {}
