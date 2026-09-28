import { Module } from '@nestjs/common';
import { ConversationService } from './application/conversation.service';
import { ConversationRepository } from './domain/conversation.repository';
import { SheetsConversationRepository } from './infrastructure/sheets-conversation.repository';

@Module({
  providers: [
    { provide: ConversationRepository, useClass: SheetsConversationRepository },
    ConversationService,
  ],
  exports: [ConversationRepository, ConversationService],
})
export class ConversationModule {}
