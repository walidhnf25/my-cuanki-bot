import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AuditLogRepository } from 'src/modules/audit/domain/audit-log.repository';
import { UserEntity } from 'src/modules/user/domain/user.entity';
import { UserRepository } from 'src/modules/user/domain/user.repository';
import { WalletService } from 'src/modules/wallet/application/wallet.service';
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
    private readonly wallets: WalletService,
  ) {}

  onModuleInit(): void {
    this.gateway.onMessage((message) => this.handle(message));
  }

  /**
   * Opening balances used to live on the user row; they are now "Saldo Awal" income
   * entries. Convert any leftover value the first time the user writes. A failure is
   * logged and retried on their next message; the balance stays correct meanwhile.
   */
  private async withConvertedOpening(user: UserEntity, now: Date): Promise<UserEntity> {
    if (user.openingCash === null && user.openingDigital === null) return user;
    try {
      return await this.wallets.migrateLegacyOpening(user, now);
    } catch (err) {
      this.logger.error({ err, userId: user.id }, 'Could not convert opening balance');
      return user;
    }
  }

  async handle(message: IncomingMessage): Promise<void> {
    if (this.dedupe.isDuplicate(message.messageId)) {
      this.logger.debug({ id: message.messageId }, 'Duplicate message ignored');
      return;
    }

    const { user: registered, created } = await this.users.findOrCreate({
      telegramId: message.from,
      chatId: message.chatId,
      displayName: message.senderName,
    });

    const user = await this.withConvertedOpening(registered, message.timestamp);

    await this.audit.record({
      userId: user.id,
      action: 'MESSAGE_IN',
      metadata: { text: message.text, messageId: message.messageId },
    });

    if (created) {
      await this.gateway.sendText(message.chatId, this.replies.onboarding(user.displayName));
    }

    const reply = await this.orchestrator.process(user, message);
    let replied = false;
    if (reply.text) {
      await this.gateway.sendText(message.chatId, reply.text);
      replied = true;
    }
    if (reply.document) {
      await this.gateway.sendDocument(
        message.chatId,
        reply.document.content,
        reply.document.filename,
        reply.document.mimeType,
      );
      replied = true;
    }
    if (replied) {
      await this.audit.record({ userId: user.id, action: 'MESSAGE_OUT' });
    }

    // New users choose their wallets right after their first reply.
    if (created) {
      const prompt = await this.orchestrator.walletSetupPrompt(user, message.timestamp);
      if (prompt) await this.gateway.sendText(message.chatId, prompt);
    }
  }
}
