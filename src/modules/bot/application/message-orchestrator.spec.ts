import { BudgetService } from 'src/modules/budget/application/budget.service';
import { CategoryEntity } from 'src/modules/category/domain/category.entity';
import { ConversationService } from 'src/modules/conversation/application/conversation.service';
import { ConversationContextEntity } from 'src/modules/conversation/domain/conversation-context.entity';
import { RuleBasedParser } from 'src/modules/parser/rule-based/rule-based.parser';
import { CsvExportService } from 'src/modules/report/application/csv-export.service';
import { ReportService } from 'src/modules/report/application/report.service';
import {
  TransactionResult,
  TransactionService,
} from 'src/modules/transaction/application/transaction.service';
import { ResetUserDataService } from 'src/modules/user/application/reset-user-data.service';
import { TransactionEntity } from 'src/modules/transaction/domain/transaction.entity';
import { UserEntity } from 'src/modules/user/domain/user.entity';
import { ConversationState, TransactionType } from 'src/shared/domain/enums';
import { Money } from 'src/shared/utils/money';
import { IncomingMessage } from '../domain/messaging.gateway.port';
import { MessageOrchestrator } from './message-orchestrator';
import { ReplyBuilder } from './reply-builder';

const NOW = new Date('2026-07-15T03:00:00.000Z');

const user: UserEntity = {
  id: 'u1',
  telegramId: '628123',
  chatId: '628123',
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
    messageId: 'w1',
    deletedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

const result: TransactionResult = { transaction: txEntity(), category };

function msg(text: string, id = 'w1'): IncomingMessage {
  return {
    messageId: id,
    from: '628123',
    chatId: '628123',
    text,
    timestamp: NOW,
  };
}

describe('MessageOrchestrator', () => {
  let conversation: jest.Mocked<ConversationService>;
  let transactions: jest.Mocked<TransactionService>;
  let budgets: jest.Mocked<BudgetService>;
  let reports: jest.Mocked<ReportService>;
  let csvExport: jest.Mocked<CsvExportService>;
  let resetData: jest.Mocked<ResetUserDataService>;
  let orchestrator: MessageOrchestrator;

  beforeEach(() => {
    conversation = {
      getActive: jest.fn().mockResolvedValue(null),
      awaitAmount: jest.fn().mockResolvedValue(undefined),
      awaitDeleteConfirm: jest.fn().mockResolvedValue(undefined),
      awaitResetConfirm: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ConversationService>;
    transactions = {
      record: jest.fn(),
      editLast: jest.fn(),
      deleteLast: jest.fn(),
      getLast: jest.fn(),
    } as unknown as jest.Mocked<TransactionService>;
    budgets = {
      setBudget: jest.fn(),
      evaluate: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<BudgetService>;
    reports = { generateSummary: jest.fn() } as unknown as jest.Mocked<ReportService>;
    csvExport = { export: jest.fn() } as unknown as jest.Mocked<CsvExportService>;
    resetData = {
      reset: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ResetUserDataService>;
    orchestrator = new MessageOrchestrator(
      new RuleBasedParser(),
      conversation,
      transactions,
      budgets,
      reports,
      csvExport,
      resetData,
      new ReplyBuilder(),
    );
  });

  describe('record', () => {
    it('records when the amount is present', async () => {
      transactions.record.mockResolvedValue(result);
      const reply = await orchestrator.process(user, msg('beli kopi 25rb'));
      expect(transactions.record).toHaveBeenCalled();
      expect(reply.text).toContain('Berhasil dicatat');
    });

    it('appends a budget alert when a threshold is crossed', async () => {
      transactions.record.mockResolvedValue(result);
      budgets.evaluate.mockResolvedValue([
        {
          categoryName: 'Makanan',
          period: 'MONTHLY' as never,
          used: Money.fromMajor(1_800_000),
          limit: Money.fromMajor(2_000_000),
          percent: 90,
          exceeded: false,
        },
      ]);
      const reply = await orchestrator.process(user, msg('beli kopi 25rb'));
      expect(reply.text).toContain('Budget');
      expect(reply.text).toContain('90%');
    });

    it('starts a clarification when the amount is missing', async () => {
      const reply = await orchestrator.process(user, msg('beli kopi'));
      expect(conversation.awaitAmount).toHaveBeenCalled();
      expect(reply.text).toContain('Berapa harga');
    });
  });

  describe('awaiting amount', () => {
    const context = {
      state: ConversationState.AWAITING_AMOUNT,
      payload: {
        transactionType: TransactionType.EXPENSE,
        description: 'kopi',
        keywords: ['kopi'],
        occurredAt: NOW.toISOString(),
      },
    } as unknown as ConversationContextEntity;

    it('completes the pending transaction from a bare amount', async () => {
      conversation.getActive.mockResolvedValue(context);
      transactions.record.mockResolvedValue(result);
      const reply = await orchestrator.process(user, msg('25 ribu', 'w2'));
      expect(transactions.record).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ description: 'kopi', keywords: ['kopi'] }),
        'w2',
      );
      expect(conversation.clear).toHaveBeenCalledWith('u1');
      expect(reply.text).toContain('Berhasil dicatat');
    });

    it('abandons the pending context on a topic change', async () => {
      conversation.getActive.mockResolvedValue(context);
      reports.generateSummary.mockResolvedValue({
        periodLabel: 'Bulan Ini',
        range: { start: NOW, end: NOW },
        income: Money.zero(),
        expense: Money.zero(),
        balance: Money.zero(),
        categories: [],
      });
      const reply = await orchestrator.process(user, msg('ringkasan bulan ini', 'w3'));
      expect(conversation.clear).toHaveBeenCalledWith('u1');
      expect(reply.text).toContain('Ringkasan');
    });
  });

  describe('summary / budget / export', () => {
    it('renders a summary', async () => {
      reports.generateSummary.mockResolvedValue({
        periodLabel: 'Bulan Ini',
        range: { start: NOW, end: NOW },
        income: Money.fromMajor(8_000_000),
        expense: Money.fromMajor(3_000_000),
        balance: Money.fromMajor(5_000_000),
        categories: [{ name: 'Makanan', icon: '🍜', total: Money.fromMajor(1_200_000) }],
      });
      const reply = await orchestrator.process(user, msg('ringkasan bulan ini'));
      expect(reply.text).toContain('Ringkasan Bulan Ini');
      expect(reply.text).toContain('Rp8.000.000');
      expect(reply.text).toContain('Makanan');
    });

    it('sets a budget', async () => {
      budgets.setBudget.mockResolvedValue({
        budget: { amount: Money.fromMajor(2_000_000), period: 'MONTHLY' } as never,
        category,
      });
      const reply = await orchestrator.process(user, msg('budget makan 2 juta'));
      expect(budgets.setBudget).toHaveBeenCalled();
      expect(reply.text).toContain('Budget diatur');
    });

    it('exports an Excel document', async () => {
      csvExport.export.mockResolvedValue({
        content: Buffer.from('x'),
        filename: 'transaksi-bulan-ini.xlsx',
        mimeType: 'application/vnd.ms-excel',
        rowCount: 3,
      });
      const reply = await orchestrator.process(user, msg('export bulan ini'));
      expect(reply.document?.filename).toBe('transaksi-bulan-ini.xlsx');
      expect(reply.text).toContain('3 transaksi');
    });
  });

  describe('delete with confirmation', () => {
    it('asks to confirm then deletes on "ya"', async () => {
      transactions.getLast.mockResolvedValue(result);
      const prompt = await orchestrator.process(user, msg('hapus'));
      expect(conversation.awaitDeleteConfirm).toHaveBeenCalled();
      expect(prompt.text).toContain('Hapus transaksi terakhir?');

      conversation.getActive.mockResolvedValue({
        state: ConversationState.AWAITING_DELETE_CONFIRM,
        payload: null,
      } as unknown as ConversationContextEntity);
      transactions.deleteLast.mockResolvedValue(result);
      const done = await orchestrator.process(user, msg('ya', 'w4'));
      expect(transactions.deleteLast).toHaveBeenCalledWith('u1');
      expect(done.text).toContain('dihapus');
    });

    it('cancels on "tidak"', async () => {
      conversation.getActive.mockResolvedValue({
        state: ConversationState.AWAITING_DELETE_CONFIRM,
        payload: null,
      } as unknown as ConversationContextEntity);
      const reply = await orchestrator.process(user, msg('tidak', 'w5'));
      expect(transactions.deleteLast).not.toHaveBeenCalled();
      expect(reply.text).toContain('dibatalkan');
    });
  });

  describe('reset data', () => {
    it('asks to confirm on "reset"', async () => {
      const reply = await orchestrator.process(user, msg('reset'));
      expect(conversation.awaitResetConfirm).toHaveBeenCalledWith('u1', NOW);
      expect(reply.text).toContain('reset SEMUA data');
      expect(resetData.reset).not.toHaveBeenCalled();
    });

    it('wipes data on "ya" while awaiting reset confirm', async () => {
      conversation.getActive.mockResolvedValue({
        state: ConversationState.AWAITING_CONFIRM,
        payload: { action: 'reset' },
      } as unknown as ConversationContextEntity);
      const reply = await orchestrator.process(user, msg('ya', 'wr'));
      expect(resetData.reset).toHaveBeenCalledWith('u1');
      expect(conversation.clear).toHaveBeenCalledWith('u1');
      expect(reply.text).toContain('direset');
    });

    it('cancels reset on "tidak"', async () => {
      conversation.getActive.mockResolvedValue({
        state: ConversationState.AWAITING_CONFIRM,
        payload: { action: 'reset' },
      } as unknown as ConversationContextEntity);
      const reply = await orchestrator.process(user, msg('tidak', 'wr2'));
      expect(resetData.reset).not.toHaveBeenCalled();
      expect(reply.text).toContain('dibatalkan');
    });
  });
});
