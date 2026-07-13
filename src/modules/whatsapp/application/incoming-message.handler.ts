import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AuditLogRepository } from 'src/modules/audit/domain/audit-log.repository';
import { MessageParser } from 'src/modules/parser/domain/message-parser.port';
import { UserRepository } from 'src/modules/user/domain/user.repository';
import { IncomingMessage, MessagingGateway } from '../domain/messaging.gateway.port';
import { CommandRouter } from './command-router';
import { MessageDedupeService } from './message-dedupe.service';
import { ReplyBuilder } from './reply-builder';

/**
 * Orchestrates the inbound pipeline:
 *   dedupe -> auto-register user -> audit -> parse -> route(action) -> reply.
 */
@Injectable()
export class IncomingMessageHandler implements OnModuleInit {
  private readonly logger = new Logger(IncomingMessageHandler.name);

  constructor(
    private readonly gateway: MessagingGateway,
    private readonly users: UserRepository,
    private readonly parser: MessageParser,
    private readonly audit: AuditLogRepository,
    private readonly dedupe: MessageDedupeService,
    private readonly replies: ReplyBuilder,
    private readonly router: CommandRouter,
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

    const intent = await this.parser.parse({
      text: message.text,
      now: message.timestamp,
      timezone: user.timezone,
    });

    const reply = await this.router.route(user.id, user.timezone, intent, message.waMessageId);
    if (reply) {
      await this.gateway.sendText(message.chatJid, reply);
      await this.audit.record({
        userId: user.id,
        action: 'MESSAGE_OUT',
        metadata: { intent: intent.type },
      });
    }
  }
}
