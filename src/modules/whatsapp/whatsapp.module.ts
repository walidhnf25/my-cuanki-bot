import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ParserModule } from '../parser/parser.module';
import { TransactionModule } from '../transaction/transaction.module';
import { UserModule } from '../user/user.module';
import { CommandRouter } from './application/command-router';
import { IncomingMessageHandler } from './application/incoming-message.handler';
import { MessageDedupeService } from './application/message-dedupe.service';
import { ReplyBuilder } from './application/reply-builder';
import { MessagingGateway } from './domain/messaging.gateway.port';
import { BaileysGateway } from './infrastructure/baileys.gateway';

/**
 * WhatsApp delivery module. Binds the MessagingGateway port to Baileys and
 * wires the inbound orchestrator. Exports the gateway + health indicator so the
 * health module can report connection status.
 */
@Module({
  imports: [UserModule, ParserModule, AuditModule, TransactionModule],
  providers: [
    { provide: MessagingGateway, useClass: BaileysGateway },
    MessageDedupeService,
    ReplyBuilder,
    CommandRouter,
    IncomingMessageHandler,
  ],
  exports: [MessagingGateway],
})
export class WhatsappModule {}
