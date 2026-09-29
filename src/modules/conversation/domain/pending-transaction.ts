import { TransactionType, Wallet } from 'src/shared/domain/enums';

/**
 * Snapshot of a transaction awaiting a missing field (the amount), stored in
 * the conversation context payload. Money is not carried here — it arrives in
 * the user's follow-up reply. Dates are ISO strings for JSON storage.
 */
export interface PendingTransaction {
  transactionType: TransactionType;
  description: string;
  keywords: string[];
  occurredAt: string;
  /** Wallet named in the original message (absent in older payloads). */
  wallet?: Wallet | null;
}
