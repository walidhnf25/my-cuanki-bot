/**
 * Integration test — exercises the repository layer against a REAL PostgreSQL.
 * Run explicitly (needs DATABASE_URL pointing at a disposable DB):
 *   bun run test:int
 * Not part of the default unit suite (`.int-spec.ts` is excluded there).
 */
import { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaModule } from 'src/database/prisma.module';
import { PrismaService } from 'src/database/prisma.service';
import { TransactionType } from 'src/shared/domain/enums';
import { Money } from 'src/shared/utils/money';
import { CategoryModule } from '../../category/category.module';
import { CategoryRepository } from '../../category/domain/category.repository';
import { UserRepository } from '../../user/domain/user.repository';
import { UserModule } from '../../user/user.module';
import { TransactionRepository } from '../domain/transaction.repository';
import { TransactionModule } from '../transaction.module';

describe('Persistence integration (real Postgres)', () => {
  let ctx: INestApplicationContext;
  let prisma: PrismaService;
  let users: UserRepository;
  let categories: CategoryRepository;
  let transactions: TransactionRepository;

  const waNumber = `int-test-${Date.now()}`;
  let userId: string;
  let categoryId: string;
  const keyword = `kopitest${Date.now()}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, UserModule, CategoryModule, TransactionModule],
    }).compile();

    ctx = await moduleRef.init();
    prisma = ctx.get(PrismaService);
    users = ctx.get(UserRepository);
    categories = ctx.get(CategoryRepository);
    transactions = ctx.get(TransactionRepository);
  });

  afterAll(async () => {
    // Cascade removes the user's transactions.
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    if (categoryId)
      await prisma.category.delete({ where: { id: categoryId } }).catch(() => undefined);
    await ctx?.close();
  });

  it('auto-registers a user (findOrCreate)', async () => {
    const first = await users.findOrCreate({ waNumber });
    userId = first.user.id;
    expect(first.created).toBe(true);

    const second = await users.findOrCreate({ waNumber });
    expect(second.created).toBe(false);
    expect(second.user.id).toBe(userId);
  });

  it('resolves a category by keyword', async () => {
    const category = await categories.create({
      name: `TestFood-${Date.now()}`,
      type: TransactionType.EXPENSE,
      isSystem: true,
    });
    categoryId = category.id;
    await prisma.categoryKeyword.create({ data: { categoryId, keyword } });

    const found = await categories.findByKeyword(keyword, { type: TransactionType.EXPENSE });
    expect(found?.id).toBe(categoryId);
  });

  it('records transactions and aggregates totals exactly', async () => {
    const now = new Date();
    await transactions.create({
      userId,
      categoryId,
      type: TransactionType.EXPENSE,
      amount: Money.fromMajor(25000),
      description: 'kopi',
      occurredAt: now,
      waMessageId: `wamid-${Date.now()}-a`,
    });
    await transactions.create({
      userId,
      type: TransactionType.INCOME,
      amount: Money.fromMajor(8_000_000),
      description: 'gaji',
      occurredAt: now,
      waMessageId: `wamid-${Date.now()}-b`,
    });

    const range = {
      start: new Date(now.getTime() - 86_400_000),
      end: new Date(now.getTime() + 86_400_000),
    };
    const totals = await transactions.sumByType(userId, range);
    expect(totals.income.toDecimalString()).toBe('8000000.00');
    expect(totals.expense.toDecimalString()).toBe('25000.00');
  });

  it('soft-deletes a transaction (excluded from queries)', async () => {
    const latest = await transactions.findLatestForUser(userId);
    expect(latest).not.toBeNull();
    await transactions.softDelete(latest!.id);

    const afterDelete = await transactions.findById(latest!.id);
    expect(afterDelete).toBeNull();
  });

  it('enforces idempotency by wa_message_id', async () => {
    const waMessageId = `wamid-idem-${Date.now()}`;
    await transactions.create({
      userId,
      type: TransactionType.EXPENSE,
      amount: Money.fromMajor(1000),
      description: 'dedupe',
      occurredAt: new Date(),
      waMessageId,
    });
    expect(await transactions.existsByWaMessageId(waMessageId)).toBe(true);
    expect(await transactions.existsByWaMessageId('never-seen')).toBe(false);
  });
});
