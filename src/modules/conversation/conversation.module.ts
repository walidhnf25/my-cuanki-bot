import { Module } from '@nestjs/common';
import { ConversationRepository } from './domain/conversation.repository';
import { PrismaConversationRepository } from './infrastructure/prisma-conversation.repository';

@Module({
  providers: [{ provide: ConversationRepository, useClass: PrismaConversationRepository }],
  exports: [ConversationRepository],
})
export class ConversationModule {}
