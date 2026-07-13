import { Injectable } from '@nestjs/common';
import { ConversationState as PrismaConversationState, Prisma } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { ConversationState } from 'src/shared/domain/enums';
import {
  ConversationContextEntity,
  ConversationPayload,
  SetContextInput,
} from '../domain/conversation-context.entity';
import { ConversationRepository } from '../domain/conversation.repository';
import { toConversationContextEntity } from './conversation.mapper';

@Injectable()
export class PrismaConversationRepository extends ConversationRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async getActive(userId: string, now: Date): Promise<ConversationContextEntity | null> {
    const row = await this.prisma.conversationContext.findUnique({
      where: { userId },
    });
    if (!row) return null;

    const entity = toConversationContextEntity(row);
    if (entity.state === ConversationState.IDLE) return null;
    if (entity.expiresAt && entity.expiresAt.getTime() <= now.getTime()) {
      return null; // expired — treated as no active context
    }
    return entity;
  }

  async set(input: SetContextInput): Promise<ConversationContextEntity> {
    const payload = this.toJsonInput(input.payload);
    const state = input.state as PrismaConversationState;

    const row = await this.prisma.conversationContext.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        state,
        payload,
        expiresAt: input.expiresAt ?? null,
      },
      update: {
        state,
        payload,
        expiresAt: input.expiresAt ?? null,
      },
    });
    return toConversationContextEntity(row);
  }

  async clear(userId: string): Promise<void> {
    await this.prisma.conversationContext.upsert({
      where: { userId },
      create: { userId, state: PrismaConversationState.IDLE },
      update: {
        state: PrismaConversationState.IDLE,
        payload: Prisma.JsonNull,
        expiresAt: null,
      },
    });
  }

  private toJsonInput(
    payload: ConversationPayload | null | undefined,
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (payload === null || payload === undefined) {
      return Prisma.JsonNull;
    }
    return payload as Prisma.InputJsonValue;
  }
}
