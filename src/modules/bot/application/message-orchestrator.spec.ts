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
import { ConversationState, TransactionType, Wallet } from 'src/shared/domain/enums';
import { Money } from 'src/shared/utils/money';
import { IncomingMessage } from '../domain/messaging.gateway.port';
import { WalletService } from 'src/modules/wallet/application/wallet.service';
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
  defaultWallet: null,
  openingCash: null,
  openingDigital: null,
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
    wallet: null,
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
  let wallets: jest.Mocked<WalletService>;
  let resetData: jest.Mocked<ResetUserDataService>;
  let orchestrator: MessageOrchestrator;

  beforeEach(() => {
    conversation = {
      getActive: jest.fn().mockResolvedValue(null),
      awaitAmount: jest.fn().mockResolvedValue(undefined),
      awaitWallet: jest.fn().mockResolvedValue(undefined),
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
    wallets = {
      overview: jest
        .fn()
        .mockResolvedValue({ enabled: false, lines: [], total: Money.zero(), transfers: [] }),
      current: jest
        .fn()
        .mockResolvedValue({ enabled: false, lines: [], total: Money.zero(), transfers: [] }),
      transfer: jest.fn(),
      getLastTransfer: jest.fn(),
      deleteLastTransfer: jest.fn(),
      setOpeningBalance: jest.fn(),
      setDefault: jest.fn(),
      clearSettings: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<WalletService>;
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
      wallets,
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

  describe('wallets', () => {
    const recordedIntent = (): { wallet: Wallet | null } =>
      transactions.record.mock.calls[0][1] as unknown as { wallet: Wallet | null };

    it('leaves the wallet empty for a user without a default', async () => {
      transactions.record.mockResolvedValue(result);
      await orchestrator.process(user, msg('beli kopi 25rb'));
      expect(recordedIntent().wallet).toBeNull();
    });

    it('uses the default wallet when the message names none', async () => {
      transactions.record.mockResolvedValue(result);
      await orchestrator.process({ ...user, defaultWallet: Wallet.DIGITAL }, msg('beli kopi 25rb'));
      expect(recordedIntent().wallet).toBe(Wallet.DIGITAL);
    });

    it('prefers a wallet named in the message over the default', async () => {
      transactions.record.mockResolvedValue(result);
      await orchestrator.process(
        { ...user, defaultWallet: Wallet.DIGITAL },
        msg('beli kopi 25rb cash'),
      );
      expect(recordedIntent().wallet).toBe(Wallet.CASH);
    });

    it('keeps the wallet through the ask-for-amount flow', async () => {
      conversation.getActive.mockResolvedValue(null);
      await orchestrator.process(user, msg('beli kopi cash'));
      expect(conversation.awaitAmount).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ wallet: Wallet.CASH }),
        NOW,
      );
    });

    describe('asking for the wallet', () => {
      const enabledOverview = { enabled: true, lines: [], total: Money.zero(), transfers: [] };

      it('asks which wallet when the user uses wallets but has no default', async () => {
        wallets.current.mockResolvedValue(enabledOverview);
        const reply = await orchestrator.process(user, msg('beli cincau 5 ribu', 'w9'));

        expect(transactions.record).not.toHaveBeenCalled();
        expect(conversation.awaitWallet).toHaveBeenCalledWith(
          'u1',
          expect.objectContaining({ amount: '5000.00', description: 'cincau', messageId: 'w9' }),
          NOW,
        );
        expect(reply.text).toContain('cash');
        expect(reply.text).toContain('digital');
      });

      it('does not ask when the message names a wallet', async () => {
        wallets.current.mockResolvedValue(enabledOverview);
        transactions.record.mockResolvedValue(result);
        await orchestrator.process(user, msg('beli cincau 5 ribu cash'));
        expect(transactions.record).toHaveBeenCalled();
        expect(conversation.awaitWallet).not.toHaveBeenCalled();
      });

      it('does not ask when a default wallet is set', async () => {
        wallets.current.mockResolvedValue(enabledOverview);
        transactions.record.mockResolvedValue(result);
        await orchestrator.process(
          { ...user, defaultWallet: Wallet.DIGITAL },
          msg('beli cincau 5 ribu'),
        );
        expect(transactions.record).toHaveBeenCalled();
        expect(conversation.awaitWallet).not.toHaveBeenCalled();
      });

      it('does not ask users who never used wallets', async () => {
        transactions.record.mockResolvedValue(result);
        await orchestrator.process(user, msg('beli cincau 5 ribu'));
        expect(transactions.record).toHaveBeenCalled();
        expect(conversation.awaitWallet).not.toHaveBeenCalled();
      });

      const waiting = {
        state: ConversationState.AWAITING_WALLET,
        payload: {
          transactionType: TransactionType.EXPENSE,
          description: 'cincau',
          keywords: ['cincau'],
          occurredAt: NOW.toISOString(),
          wallet: null,
          amount: '5000.00',
          raw: 'beli cincau 5 ribu',
          messageId: 'w9',
        },
      } as unknown as ConversationContextEntity;

      it('records with the answered wallet, original amount and message id', async () => {
        conversation.getActive.mockResolvedValue(waiting);
        transactions.record.mockResolvedValue(result);
        const reply = await orchestrator.process(user, msg('digital', 'w10'));

        expect(transactions.record).toHaveBeenCalledWith(
          'u1',
          expect.objectContaining({ wallet: Wallet.DIGITAL, description: 'cincau' }),
          'w9',
        );
        const intent = transactions.record.mock.calls[0][1];
        expect(intent.amount?.toNumber()).toBe(5000);
        expect(conversation.clear).toHaveBeenCalledWith('u1');
        expect(reply.text).toContain('Berhasil dicatat');
      });

      it('asks again on an unclear answer and cancels on "batal"', async () => {
        conversation.getActive.mockResolvedValue(waiting);
        const retry = await orchestrator.process(user, msg('hmm', 'w11'));
        expect(retry.text).toContain('cash');
        expect(transactions.record).not.toHaveBeenCalled();

        const cancelled = await orchestrator.process(user, msg('batal', 'w12'));
        expect(cancelled.text).toContain('dibatalkan');
        expect(transactions.record).not.toHaveBeenCalled();
      });

      it('asks for the wallet after the amount arrives, without clearing the new question', async () => {
        wallets.current.mockResolvedValue(enabledOverview);
        conversation.getActive.mockResolvedValue({
          state: ConversationState.AWAITING_AMOUNT,
          payload: {
            transactionType: TransactionType.EXPENSE,
            description: 'kopi',
            keywords: ['kopi'],
            occurredAt: NOW.toISOString(),
          },
        } as unknown as ConversationContextEntity);

        await orchestrator.process(user, msg('25 ribu', 'w13'));

        const cleared = conversation.clear.mock.invocationCallOrder[0];
        const asked = conversation.awaitWallet.mock.invocationCallOrder[0];
        expect(cleared).toBeLessThan(asked);
      });
    });

    describe('transfers', () => {
      const transferEntity = {
        id: 't1',
        userId: 'u1',
        from: Wallet.DIGITAL,
        to: Wallet.CASH,
        amount: Money.fromMajor(500000),
        note: null,
        occurredAt: NOW,
        messageId: 'w1',
        deletedAt: null,
        createdAt: NOW,
      };

      it('moves money from digital to cash on "tarik tunai"', async () => {
        wallets.transfer.mockResolvedValue(transferEntity);
        const reply = await orchestrator.process(user, msg('tarik tunai 500rb', 'w20'));

        expect(wallets.transfer).toHaveBeenCalledWith(
          'u1',
          Wallet.DIGITAL,
          Wallet.CASH,
          expect.objectContaining({}),
          NOW,
          'w20',
        );
        expect(wallets.transfer.mock.calls[0][3].toNumber()).toBe(500000);
        expect(reply.text).toContain('Transfer dicatat');
        expect(reply.text).toContain('Rp500.000');
      });

      it('sends nothing for an already-recorded message', async () => {
        wallets.transfer.mockResolvedValue(null);
        expect(await orchestrator.process(user, msg('tarik tunai 500rb'))).toEqual({});
      });

      it('asks for the amount or the direction when missing', async () => {
        const noAmount = await orchestrator.process(user, msg('tarik tunai'));
        expect(noAmount.text).toContain('nominal');
        const noDirection = await orchestrator.process(user, msg('pindah 300rb'));
        expect(noDirection.text).toContain('arah');
        expect(wallets.transfer).not.toHaveBeenCalled();
      });

      it('rejects a transfer to the same wallet', async () => {
        const reply = await orchestrator.process(user, msg('pindah 300rb dari cash ke cash'));
        expect(reply.text).toContain('tidak boleh sama');
        expect(wallets.transfer).not.toHaveBeenCalled();
      });

      it('confirms before deleting the latest transfer', async () => {
        wallets.getLastTransfer.mockResolvedValue(transferEntity);
        const ask = await orchestrator.process(user, msg('hapus transfer'));
        expect(conversation.awaitDeleteConfirm).toHaveBeenCalledWith('u1', NOW, 'transfer');
        expect(ask.text).toContain('Hapus transfer terakhir');

        conversation.getActive.mockResolvedValue({
          state: ConversationState.AWAITING_DELETE_CONFIRM,
          payload: { target: 'transfer' },
        } as unknown as ConversationContextEntity);
        wallets.deleteLastTransfer.mockResolvedValue(transferEntity);
        const done = await orchestrator.process(user, msg('ya', 'w21'));
        expect(wallets.deleteLastTransfer).toHaveBeenCalledWith('u1');
        expect(transactions.deleteLast).not.toHaveBeenCalled();
        expect(done.text).toContain('Transfer dihapus');
      });

      it('says so when there is no transfer to delete', async () => {
        wallets.getLastTransfer.mockResolvedValue(null);
        const reply = await orchestrator.process(user, msg('hapus transfer'));
        expect(reply.text).toContain('Belum ada transfer');
        expect(conversation.awaitDeleteConfirm).not.toHaveBeenCalled();
      });
    });

    it('shows balances for the balance command', async () => {
      wallets.current.mockResolvedValue({
        enabled: true,
        lines: [
          {
            wallet: Wallet.CASH,
            income: Money.zero(),
            expense: Money.zero(),
            balance: Money.fromMajor(400000),
            transferIn: Money.zero(),
            transferOut: Money.zero(),
            categories: [],
          },
          {
            wallet: Wallet.DIGITAL,
            income: Money.zero(),
            expense: Money.zero(),
            balance: Money.fromMajor(150000),
            transferIn: Money.zero(),
            transferOut: Money.zero(),
            categories: [],
          },
        ],
        total: Money.fromMajor(550000),
        transfers: [],
      });
      const reply = await orchestrator.process(user, msg('saldo'));
      expect(reply.text).toContain('Rp400.000');
      expect(reply.text).toContain('Rp150.000');
      expect(reply.text).toContain('Rp550.000');
    });

    it('sets the opening balance', async () => {
      const reply = await orchestrator.process(user, msg('saldo awal digital 1 juta'));
      expect(wallets.setOpeningBalance).toHaveBeenCalledWith(
        'u1',
        Wallet.DIGITAL,
        expect.objectContaining({}),
      );
      expect(reply.text).toContain('Rp1.000.000');
    });

    it('asks again when the opening balance is incomplete', async () => {
      const reply = await orchestrator.process(user, msg('saldo awal 200rb'));
      expect(wallets.setOpeningBalance).not.toHaveBeenCalled();
      expect(reply.text).toContain('saldo awal cash');
    });

    it('sets the default wallet', async () => {
      const reply = await orchestrator.process(user, msg('default digital'));
      expect(wallets.setDefault).toHaveBeenCalledWith('u1', Wallet.DIGITAL);
      expect(reply.text).toContain('default');
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
