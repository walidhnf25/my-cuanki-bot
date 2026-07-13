import { CategoryEntity } from 'src/modules/category/domain/category.entity';
import { IntentType, ParsedIntent } from 'src/modules/parser/domain/parsed-intent';
import {
  TransactionResult,
  TransactionService,
} from 'src/modules/transaction/application/transaction.service';
import { TransactionEntity } from 'src/modules/transaction/domain/transaction.entity';
import { TransactionType } from 'src/shared/domain/enums';
import { Money } from 'src/shared/utils/money';
import { CommandRouter } from './command-router';
import { ReplyBuilder } from './reply-builder';

const TZ = 'Asia/Jakarta';

const category: CategoryEntity = {
  id: 'cat-food',
  userId: null,
  name: 'Makanan',
  type: TransactionType.EXPENSE,
  icon: '🍜',
  isSystem: true,
  createdAt: new Date(),
};

const transaction: TransactionEntity = {
  id: 'tx1',
  userId: 'u1',
  categoryId: 'cat-food',
  type: TransactionType.EXPENSE,
  amount: Money.fromMajor(25000),
  description: 'kopi',
  note: null,
  occurredAt: new Date('2026-07-15T05:00:00.000Z'),
  sourceMessage: 'beli kopi 25rb',
  waMessageId: 'wamid-1',
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const result: TransactionResult = { transaction, category };

describe('CommandRouter', () => {
  let tx: jest.Mocked<TransactionService>;
  let router: CommandRouter;

  beforeEach(() => {
    tx = {
      record: jest.fn(),
      editLast: jest.fn(),
      deleteLast: jest.fn(),
    } as unknown as jest.Mocked<TransactionService>;
    router = new CommandRouter(tx, new ReplyBuilder());
  });

  it('records a transaction and returns a success reply', async () => {
    tx.record.mockResolvedValue(result);
    const intent: ParsedIntent = {
      type: IntentType.RecordTransaction,
      raw: 'beli kopi 25rb',
      transactionType: TransactionType.EXPENSE,
      amount: Money.fromMajor(25000),
      description: 'kopi',
      keywords: ['kopi'],
      occurredAt: transaction.occurredAt,
    };
    const reply = await router.route('u1', TZ, intent, 'wamid-1');
    expect(reply).toContain('Berhasil dicatat');
    expect(reply).toContain('Rp25.000');
    expect(reply).toContain('Makanan');
  });

  it('asks for the amount when it is missing', async () => {
    const intent: ParsedIntent = {
      type: IntentType.RecordTransaction,
      raw: 'beli kopi',
      transactionType: TransactionType.EXPENSE,
      amount: null,
      description: 'kopi',
      keywords: ['kopi'],
      occurredAt: transaction.occurredAt,
    };
    const reply = await router.route('u1', TZ, intent, 'wamid-2');
    expect(reply).toContain('Berapa harganya');
    expect(tx.record).not.toHaveBeenCalled();
  });

  it('returns empty string on an idempotent replay', async () => {
    tx.record.mockResolvedValue(null);
    const intent: ParsedIntent = {
      type: IntentType.RecordTransaction,
      raw: 'beli kopi 25rb',
      transactionType: TransactionType.EXPENSE,
      amount: Money.fromMajor(25000),
      description: 'kopi',
      keywords: ['kopi'],
      occurredAt: transaction.occurredAt,
    };
    expect(await router.route('u1', TZ, intent, 'wamid-1')).toBe('');
  });

  it('deletes the last transaction', async () => {
    tx.deleteLast.mockResolvedValue(result);
    const reply = await router.route(
      'u1',
      TZ,
      { type: IntentType.DeleteTransaction, raw: 'hapus' },
      'wamid-3',
    );
    expect(reply).toContain('dihapus');
  });

  it('reports nothing to delete', async () => {
    tx.deleteLast.mockResolvedValue(null);
    const reply = await router.route(
      'u1',
      TZ,
      { type: IntentType.DeleteTransaction, raw: 'hapus' },
      'wamid-4',
    );
    expect(reply).toContain('Belum ada transaksi');
  });

  it('falls back to ReplyBuilder for non-transactional intents', async () => {
    const reply = await router.route('u1', TZ, { type: IntentType.Help, raw: 'help' }, 'wamid-5');
    expect(reply).toContain('Menu Finance Bot');
  });
});
