import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { cellDate, cellRequiredString, cellString, dateCell } from 'src/sheets/cells';
import { SheetsClient } from 'src/sheets/sheets.client';
import { SheetRecord, SheetRow } from 'src/sheets/sheets.schema';
import { ConversationState } from 'src/shared/domain/enums';
import {
  ConversationContextEntity,
  ConversationPayload,
  SetContextInput,
} from '../domain/conversation-context.entity';
import { ConversationRepository } from '../domain/conversation.repository';

const SHEET = 'conversations';
const logger = new Logger('SheetsConversationRepository');

function parsePayload(value: string | null): ConversationPayload | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as ConversationPayload;
  } catch {
    logger.warn('Ignoring unparsable conversation payload');
    return null;
  }
}

function toEntity(data: SheetRecord): ConversationContextEntity {
  const createdAt = cellDate(data.created_at) ?? new Date(0);
  return {
    id: cellRequiredString(data.id),
    userId: cellRequiredString(data.user_id),
    state: (cellString(data.state) ?? ConversationState.IDLE) as ConversationState,
    payload: parsePayload(cellString(data.payload)),
    expiresAt: cellDate(data.expires_at),
    createdAt,
    updatedAt: cellDate(data.updated_at) ?? createdAt,
  };
}

function toRecord(ctx: ConversationContextEntity): SheetRecord {
  return {
    id: ctx.id,
    user_id: ctx.userId,
    state: ctx.state,
    payload: ctx.payload ? JSON.stringify(ctx.payload) : null,
    expires_at: dateCell(ctx.expiresAt),
    created_at: dateCell(ctx.createdAt),
    updated_at: dateCell(ctx.updatedAt),
  };
}

/** One row per user holding the multi-turn conversation state. */
@Injectable()
export class SheetsConversationRepository extends ConversationRepository {
  constructor(private readonly sheets: SheetsClient) {
    super();
  }

  async getActive(userId: string, now: Date): Promise<ConversationContextEntity | null> {
    const row = await this.findRow(userId);
    if (!row) return null;

    const entity = toEntity(row.data);
    if (entity.state === ConversationState.IDLE) return null;
    if (entity.expiresAt && entity.expiresAt.getTime() <= now.getTime()) {
      return null; // expired — treated as no active context
    }
    return entity;
  }

  async set(input: SetContextInput): Promise<ConversationContextEntity> {
    return this.upsert(input.userId, {
      state: input.state,
      payload: input.payload ?? null,
      expiresAt: input.expiresAt ?? null,
    });
  }

  async clear(userId: string): Promise<void> {
    const row = await this.findRow(userId);
    if (!row || cellString(row.data.state) === ConversationState.IDLE) return;
    await this.upsert(userId, { state: ConversationState.IDLE, payload: null, expiresAt: null });
  }

  private async upsert(
    userId: string,
    fields: Pick<ConversationContextEntity, 'state' | 'payload' | 'expiresAt'>,
  ): Promise<ConversationContextEntity> {
    const now = new Date();
    const row = await this.findRow(userId);

    if (row) {
      const updated: ConversationContextEntity = {
        ...toEntity(row.data),
        ...fields,
        updatedAt: now,
      };
      await this.sheets.update(SHEET, row.rowNumber, toRecord(updated));
      return updated;
    }

    const created: ConversationContextEntity = {
      id: randomUUID(),
      userId,
      ...fields,
      createdAt: now,
      updatedAt: now,
    };
    await this.sheets.append(SHEET, [toRecord(created)]);
    return created;
  }

  private async findRow(userId: string): Promise<SheetRow | undefined> {
    const rows = await this.sheets.getRows(SHEET);
    return rows.find((r) => cellString(r.data.user_id) === userId);
  }
}
