import { Injectable, Logger } from '@nestjs/common';
import { cellString } from 'src/sheets/cells';
import { RowDeletion, SheetsClient } from 'src/sheets/sheets.client';
import { SheetName } from 'src/sheets/sheets.schema';

/** Tabs whose rows belong to a user (via `user_id`) and are wiped on reset. */
const USER_OWNED_SHEETS: SheetName[] = ['transactions', 'budgets', 'conversations', 'categories'];

/**
 * Wipes all data belonging to a single user so they can start over. Removes
 * transactions, budgets, the conversation context and the user's own custom
 * categories — in one atomic batch. System categories (no user_id) and the
 * user record itself are kept.
 */
@Injectable()
export class ResetUserDataService {
  private readonly logger = new Logger(ResetUserDataService.name);

  constructor(private readonly sheets: SheetsClient) {}

  async reset(userId: string): Promise<void> {
    const deletions: RowDeletion[] = [];
    for (const sheet of USER_OWNED_SHEETS) {
      const rows = await this.sheets.getRows(sheet);
      const rowNumbers = rows
        .filter((r) => cellString(r.data.user_id) === userId)
        .map((r) => r.rowNumber);
      if (rowNumbers.length > 0) deletions.push({ sheet, rowNumbers });
    }
    await this.sheets.deleteRows(deletions);
    this.logger.log({ userId }, 'User data reset');
  }
}
