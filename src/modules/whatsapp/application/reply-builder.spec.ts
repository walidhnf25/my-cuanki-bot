import { TransactionType } from 'src/shared/domain/enums';
import { Money } from 'src/shared/utils/money';
import { IntentType, ParsedIntent } from 'src/modules/parser/domain/parsed-intent';
import { ReplyBuilder } from './reply-builder';

describe('ReplyBuilder', () => {
  const replies = new ReplyBuilder();

  it('builds an onboarding message with the name', () => {
    const msg = replies.onboarding('Budi');
    expect(msg).toContain('Budi');
    expect(msg).toContain('Finance Bot');
    expect(msg).toContain('beli kopi 25rb');
  });

  it('acknowledges a recorded expense with formatted amount', () => {
    const intent: ParsedIntent = {
      type: IntentType.RecordTransaction,
      raw: 'beli kopi 25rb',
      transactionType: TransactionType.EXPENSE,
      amount: Money.fromMajor(25000),
      description: 'kopi',
      keywords: ['kopi'],
      occurredAt: new Date(),
    };
    const reply = replies.compose(intent);
    expect(reply).toContain('Pengeluaran');
    expect(reply).toContain('Rp25.000');
    expect(reply).toContain('kopi');
  });

  it('asks for the price when the amount is missing', () => {
    const intent: ParsedIntent = {
      type: IntentType.RecordTransaction,
      raw: 'beli kopi',
      transactionType: TransactionType.EXPENSE,
      amount: null,
      description: 'kopi',
      keywords: ['kopi'],
      occurredAt: new Date(),
    };
    expect(replies.compose(intent)).toContain('Berapa harganya');
  });

  it('shows the help menu', () => {
    expect(replies.compose({ type: IntentType.Help, raw: 'help' })).toContain('Menu Finance Bot');
  });

  it('falls back for unknown input', () => {
    expect(replies.compose({ type: IntentType.Unknown, raw: 'xyz' })).toContain('help');
  });
});
