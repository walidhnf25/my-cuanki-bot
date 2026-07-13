import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { CreateUserInput, UpdateUserInput, UserEntity } from '../domain/user.entity';
import { UserRepository } from '../domain/user.repository';
import { toUserEntity } from './user.mapper';

@Injectable()
export class PrismaUserRepository extends UserRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string): Promise<UserEntity | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? toUserEntity(row) : null;
  }

  async findByWaNumber(waNumber: string): Promise<UserEntity | null> {
    const row = await this.prisma.user.findUnique({ where: { waNumber } });
    return row ? toUserEntity(row) : null;
  }

  async findOrCreate(input: CreateUserInput): Promise<{ user: UserEntity; created: boolean }> {
    const existing = await this.prisma.user.findUnique({
      where: { waNumber: input.waNumber },
    });
    if (existing) {
      return { user: toUserEntity(existing), created: false };
    }

    try {
      const created = await this.prisma.user.create({
        data: { waNumber: input.waNumber, displayName: input.displayName ?? null },
      });
      return { user: toUserEntity(created), created: true };
    } catch (error) {
      // Lost a create race — another request created it first.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const row = await this.prisma.user.findUniqueOrThrow({
          where: { waNumber: input.waNumber },
        });
        return { user: toUserEntity(row), created: false };
      }
      throw error;
    }
  }

  async update(id: string, patch: UpdateUserInput): Promise<UserEntity> {
    const row = await this.prisma.user.update({ where: { id }, data: patch });
    return toUserEntity(row);
  }
}
