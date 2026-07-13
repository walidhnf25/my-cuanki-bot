import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import {
  CreateReminderInput,
  ReminderEntity,
  UpdateReminderInput,
} from '../domain/reminder.entity';
import { ReminderRepository } from '../domain/reminder.repository';
import { toReminderEntity } from './reminder.mapper';

@Injectable()
export class PrismaReminderRepository extends ReminderRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(input: CreateReminderInput): Promise<ReminderEntity> {
    const row = await this.prisma.reminder.create({
      data: {
        userId: input.userId,
        title: input.title,
        cronExpression: input.cronExpression,
        nextRunAt: input.nextRunAt ?? null,
      },
    });
    return toReminderEntity(row);
  }

  async findDue(now: Date): Promise<ReminderEntity[]> {
    const rows = await this.prisma.reminder.findMany({
      where: { isActive: true, nextRunAt: { not: null, lte: now } },
      orderBy: { nextRunAt: 'asc' },
    });
    return rows.map(toReminderEntity);
  }

  async findForUser(userId: string): Promise<ReminderEntity[]> {
    const rows = await this.prisma.reminder.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toReminderEntity);
  }

  async update(id: string, patch: UpdateReminderInput): Promise<ReminderEntity> {
    const data: Prisma.ReminderUpdateInput = {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.cronExpression !== undefined ? { cronExpression: patch.cronExpression } : {}),
      ...(patch.nextRunAt !== undefined ? { nextRunAt: patch.nextRunAt } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      ...(patch.lastSentAt !== undefined ? { lastSentAt: patch.lastSentAt } : {}),
    };
    const row = await this.prisma.reminder.update({ where: { id }, data });
    return toReminderEntity(row);
  }

  async deactivate(id: string): Promise<void> {
    await this.prisma.reminder.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
