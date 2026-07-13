import { ConversationService } from 'src/modules/conversation/application/conversation.service';
import { ConversationContextEntity } from 'src/modules/conversation/domain/conversation-context.entity';
import { RuleBasedParser } from 'src/modules/parser/rule-based/rule-based.parser';
import {
  TransactionResult,
  TransactionService,
} from 'src/modules/transaction/application/transaction.service';
import { TransactionEntity } from 'src/modules/transaction/domain/transaction.entity';
import { CategoryEntity } from 'src/modules/category/domain/category.entity';
import { UserEntity } from 'src/modules/user/domain/user.entity';
import { ConversationState, TransactionType } from 'src/shared/domain/enums';
import { Money } from 'src/shared/utils/money';
import { IncomingMessage } from '../domain/messaging.gateway.port';
import { MessageOrchestrator } from './message-orchestrator';
import { ReplyBuilder } from './reply-builder';

const NOW = new Date('2026-07-15T03:00:00.000Z');

const user: UserEntity = {
  id: 'u1',
  waNumber: '628123',
  displayName: 'Budi',
  currency: 'IDR',
  timezone: 'Asia/Jakarta',
  isOnboarded: true,
  createdAt: NOW,
  updatedAt: NOW,
};

const category: CategoryEntity = {
  id: 'cat-food',
  userId: null,
  name: 'Makanan',
  type: TransactionType.EXPENSE,
  icon: '🍜',
  isSystem: true,
  createdAt: NOW,
};

function txEntity(over: Partial<TransactionEntity> = {}): TransactionEntity {
  return {
    id: 'tx1',
    userId: 'u1',
    categoryId: 'cat-food',
    type: TransactionType.EXPENSE,
    amount: Money.fromMajor(25000),
    description: 'kopi',
    note: null,
    occurredAt: NOW,
    sourceMessage: '',
    waMessageId: 'w1',
    deletedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

const result: TransactionResult = { transaction: txEntity(), category };

function msg(text: string, id = 'w1'): IncomingMessage {
  return {
    waMessageId: id,
    from: '628123',
    chatJid: '628123@s.whatsapp.net',
    text,
    timestamp: NOW,
  };
}

describe('MessageOrchestrator', () => {
  let conversation: jest.Mocked<ConversationService>;
  let transactions: jest.Mocked<TransactionService>;
  let orchestrator: MessageOrchestrator;

  beforeEach(() => {
    conversation = {
      getActive: jest.fn().mockResolvedValue(null),
      awaitAmount: jest.fn().mockResolvedValue(undefined),
      awaitDeleteConfirm: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ConversationService>;
    transactions = {
      record: jest.fn(),
      editLast: jest.fn(),
      deleteLast: jest.fn(),
      getLast: jest.fn(),
    } as unknown as jest.Mocked<TransactionService>;
    orchestrator = new MessageOrchestrator(
      new RuleBasedParser(),
      conversation,
      transactions,
      new ReplyBuilder(),
    );
  });

  describe('fresh record', () => {
    it('records immediately when the amount is present', async () => {
      transactions.record.mockResolvedValue(result);
      const reply = await orchestrator.process(user, msg('beli kopi 25rb'));
      expect(transactions.record).toHaveBeenCalled();
      expect(reply).toContain('Berhasil dicatat');
    });

    it('starts a clarification when the amount is missing', async () => {
      const reply = await orchestrator.process(user, msg('beli kopi'));
      expect(conversation.awaitAmount).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({
          description: 'kopi',
          keywords: expect.arrayContaining(['kopi']),
        }),
        NOW,
      );
      expect(reply).toContain('Berapa harga');
      expect(reply).toContain('kopi');
      expect(transactions.record).not.toHaveBeenCalled();
    });
  });

  describe('awaiting amount', () => {
    const context = {
      id: 'c1',
      userId: 'u1',
      state: ConversationState.AWAITING_AMOUNT,
      payload: {
        transactionType: TransactionType.EXPENSE,
        description: 'kopi',
        keywords: ['kopi'],
        occurredAt: NOW.toISOString(),
      },
      expiresAt: new Date(NOW.getTime() + 60_000),
      createdAt: NOW,
      updatedAt: NOW,
    } as unknown as ConversationContextEntity;

    it('completes the pending transaction from a bare amount', async () => {
      conversation.getActive.mockResolvedValue(context);
      transactions.record.mockResolvedValue(result);

      const reply = await orchestrator.process(user, msg('25 ribu', 'w2'));

      expect(transactions.record).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({
          amount: expect.any(Money),
          description: 'kopi',
          keywords: ['kopi'],
        }),
        'w2',
      );
      expect(conversation.clear).toHaveBeenCalledWith('u1');
      expect(reply).toContain('Berhasil dicatat');
    });

    it('abandons the pending context when the user changes topic', async () => {
      conversation.getActive.mockResolvedValue(context);
      const reply = await orchestrator.process(user, msg('ringkasan bulan ini', 'w3'));
      expect(conversation.clear).toHaveBeenCalledWith('u1');
      expect(transactions.record).not.toHaveBeenCalled();
      expect(reply).toContain('Ringkasan'); // placeholder from ReplyBuilder
    });
  });

  describe('delete with confirmation', () => {
    it('asks for confirmation and stores the confirm state', async () => {
      transactions.getLast.mockResolvedValue(result);
      const reply = await orchestrator.process(user, msg('hapus'));
      expect(conversation.awaitDeleteConfirm).toHaveBeenCalledWith('u1', NOW);
      expect(reply).toContain('Hapus transaksi terakhir?');
    });

    it('reports when there is nothing to delete', async () => {
      transactions.getLast.mockResolvedValue(null);
      const reply = await orchestrator.process(user, msg('hapus'));
      expect(reply).toContain('Belum ada transaksi');
      expect(conversation.awaitDeleteConfirm).not.toHaveBeenCalled();
    });

    it('deletes on "ya"', async () => {
      conversation.getActive.mockResolvedValue({
        state: ConversationState.AWAITING_DELETE_CONFIRM,
        payload: null,
      } as unknown as ConversationContextEntity);
      transactions.deleteLast.mockResolvedValue(result);

      const reply = await orchestrator.process(user, msg('ya', 'w4'));
      expect(transactions.deleteLast).toHaveBeenCalledWith('u1');
      expect(reply).toContain('dihapus');
    });

    it('cancels on "tidak"', async () => {
      conversation.getActive.mockResolvedValue({
        state: ConversationState.AWAITING_DELETE_CONFIRM,
        payload: null,
      } as unknown as ConversationContextEntity);

      const reply = await orchestrator.process(user, msg('tidak', 'w5'));
      expect(transactions.deleteLast).not.toHaveBeenCalled();
      expect(reply).toContain('dibatalkan');
    });
  });
});
