import { Prisma, TransactionType as PrismaTransactionType } from '@prisma/client';
import { TransactionType } from 'src/shared/domain/enums';
import { Money } from 'src/shared/utils/money';
import { decimalSumToMoney, toTransactionEntity } from './transaction.mapper';

function fakeRow(overrides: Partial<Record<string, unknown>> = {}) {
  const base = {
    id: 't1',
    userId: 'u1',
    categoryId: 'c1',
    type: PrismaTransactionType.EXPENSE,
    amount: new Prisma.Decimal('25000.00'),
    description: 'kopi',
    note: null,
    occurredAt: new Date('2026-07-12T03:00:00.000Z'),
    sourceMessage: 'beli kopi 25rb',
    waMessageId: 'wamid-1',
    deletedAt: null,
    createdAt: new Date('2026-07-12T03:00:00.000Z'),
    updatedAt: new Date('2026-07-12T03:00:00.000Z'),
    ...overrides,
  };
  // The mapper only reads known fields; cast is safe for a unit test.
  return base as unknown as Parameters<typeof toTransactionEntity>[0];
}

describe('transaction.mapper', () => {
  describe('toTransactionEntity', () => {
    it('maps a Prisma Decimal amount to an exact Money', () => {
      const entity = toTransactionEntity(fakeRow());
      expect(entity.amount).toBeInstanceOf(Money);
      expect(entity.amount.toDecimalString()).toBe('25000.00');
      expect(entity.amount.equals(Money.fromMajor(25000))).toBe(true);
    });

    it('maps the transaction type into the domain enum', () => {
      const entity = toTransactionEntity(fakeRow());
      expect(entity.type).toBe(TransactionType.EXPENSE);
    });

    it('preserves nullable fields', () => {
      const entity = toTransactionEntity(fakeRow({ note: null, categoryId: null }));
      expect(entity.note).toBeNull();
      expect(entity.categoryId).toBeNull();
    });

    it('handles amounts with fractional decimals', () => {
      const entity = toTransactionEntity(fakeRow({ amount: new Prisma.Decimal('1500.50') }));
      expect(entity.amount.format()).toBe('Rp1.500,50');
    });
  });

  describe('decimalSumToMoney', () => {
    it('returns zero for a null sum', () => {
      expect(decimalSumToMoney(null).isZero()).toBe(true);
    });

    it('converts a Decimal sum to Money', () => {
      expect(decimalSumToMoney(new Prisma.Decimal('8000000.00')).toNumber()).toBe(8_000_000);
    });
  });
});
