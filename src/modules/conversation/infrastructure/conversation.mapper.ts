import type { ConversationContext as PrismaConversationContext } from '@prisma/client';
import { ConversationState } from 'src/shared/domain/enums';
import {
  ConversationContextEntity,
  ConversationPayload,
} from '../domain/conversation-context.entity';

export function toConversationContextEntity(
  row: PrismaConversationContext,
): ConversationContextEntity {
  return {
    id: row.id,
    userId: row.userId,
    state: row.state as ConversationState,
    payload: (row.payload as ConversationPayload | null) ?? null,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
