import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AuditLogRepository } from 'src/modules/audit/domain/audit-log.repository';
import { UserRepository } from 'src/modules/user/domain/user.repository';
import { IncomingMessage, MessagingGateway } from '../domain/messaging.gateway.port';
import { MessageDedupeService } from './message-dedupe.service';
import { MessageOrchestrator } from './message-orchestrator';
import { ReplyBuilder } from './reply-builder';

/**
 * Inbound pipeline: dedupe -> auto-register user -> audit -> orchestrate -> reply.
 * Parsing, conversation state and actions live in the MessageOrchestrator.
 */
@Injectable()
export class IncomingMessageHandler implements OnModuleInit {
  private readonly logger = new Logger(IncomingMessageHandler.name);

  constructor(
    private readonly gateway: MessagingGateway,
    private readonly users: UserRepository,
    private readonly audit: AuditLogRepository,
    private readonly dedupe: MessageDedupeService,
    private readonly replies: ReplyBuilder,
    private readonly orchestrator: MessageOrchestrator,
  ) {}

  onModuleInit(): void {
    this.gateway.onMessage((message) => this.handle(message));
  }

  async handle(message: IncomingMessage): Promise<void> {
    if (this.dedupe.isDuplicate(message.waMessageId)) {
      this.logger.debug({ id: message.waMessageId }, 'Duplicate message ignored');
      return;
    }

    const { user, created } = await this.users.findOrCreate({
      waNumber: message.from,
      chatJid: message.chatJid,
      displayName: message.pushName,
    });

    await this.audit.record({
      userId: user.id,
      action: 'MESSAGE_IN',
      metadata: { text: message.text, waMessageId: message.waMessageId },
    });

    if (created) {
      await this.gateway.sendText(message.chatJid, this.replies.onboarding(user.displayName));
    }

    const reply = await this.orchestrator.process(user, message);
    let replied = false;
    if (reply.text) {
      await this.gateway.sendText(message.chatJid, reply.text);
      replied = true;
    }
    if (reply.document) {
      await this.gateway.sendDocument(
        message.chatJid,
        reply.document.content,
        reply.document.filename,
        'text/csv',
      );
      replied = true;
    }
    if (replied) {
      await this.audit.record({ userId: user.id, action: 'MESSAGE_OUT' });
    }
  }
}
