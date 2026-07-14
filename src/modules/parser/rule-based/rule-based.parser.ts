import { Injectable } from '@nestjs/common';
import { BudgetPeriod, TransactionType } from 'src/shared/domain/enums';
import { DEFAULT_TIMEZONE } from 'src/shared/utils/date.util';
import { Money } from 'src/shared/utils/money';
import { normalizeText, tokenize } from 'src/shared/utils/string-normalizer';
import { MessageParser, ParseInput } from '../domain/message-parser.port';
import { IntentType, ParsedIntent, SummaryPeriod } from '../domain/parsed-intent';
import { extractAmount } from './amount.tokenizer';
import { extractDate } from './date.tokenizer';
import { extractDateRange } from './date-range.tokenizer';
import {
  BUDGET_WORDS,
  DELETE_WORDS,
  EDIT_WORDS,
  EXPENSE_VERBS,
  EXPORT_WORDS,
  GREETING_WORDS,
  HELP_WORDS,
  INCOME_WORDS,
  REMINDER_WORDS,
  STOPWORDS,
  SUMMARY_WORDS,
} from './keywords';

/**
 * Deterministic, dictionary + regex based parser. No external services.
 * Selected when PARSER_DRIVER=rule. Fully unit-tested and side-effect free.
 */
@Injectable()
export class RuleBasedParser extends MessageParser {
  parse(input: ParseInput): Promise<ParsedIntent> {
    return Promise.resolve(this.parseSync(input));
  }

  parseAmount(text: string): Money | null {
    return extractAmount(text)?.amount ?? null;
  }

  private parseSync(input: ParseInput): ParsedIntent {
    const raw = input.text.trim();
    const now = input.now ?? new Date();
    const tz = input.timezone ?? DEFAULT_TIMEZONE;
    const normalized = normalizeText(raw);

    if (normalized.length === 0) {
      return { type: IntentType.Unknown, raw };
    }

    const tokens = new Set(tokenize(raw));
    const has = (words: string[]): boolean =>
      words.some((w) => (w.includes(' ') ? normalized.includes(w) : tokens.has(w)));

    // ---- Command intents (priority order) ----
    if (has(HELP_WORDS)) {
      return { type: IntentType.Help, raw };
    }
    // Reset must be checked before delete so "hapus semua" isn't treated as
    // deleting the last transaction.
    if (tokens.has('reset') || /\bhapus semua\b|\breset data\b/.test(normalized)) {
      return { type: IntentType.ResetData, raw };
    }
    if (has(DELETE_WORDS)) {
      return { type: IntentType.DeleteTransaction, raw };
    }
    if (has(SUMMARY_WORDS)) {
      const customRange = extractDateRange(raw, now, tz) ?? undefined;
      return { type: IntentType.Summary, raw, period: this.detectPeriod(normalized), customRange };
    }
    if (has(EXPORT_WORDS)) {
      const customRange = extractDateRange(raw, now, tz) ?? undefined;
      return { type: IntentType.Export, raw, period: this.detectPeriod(normalized), customRange };
    }
    if (has(BUDGET_WORDS)) {
      const amount = extractAmount(raw)?.amount ?? null;
      const keywords = this.extractKeywords(raw, BUDGET_WORDS);
      return {
        type: IntentType.SetBudget,
        raw,
        amount,
        keywords,
        period: this.detectBudgetPeriod(normalized),
      };
    }
    if (has(REMINDER_WORDS)) {
      const title = this.stripWords(raw, REMINDER_WORDS);
      return { type: IntentType.SetReminder, raw, title, schedulePhrase: raw };
    }
    if (has(EDIT_WORDS)) {
      return {
        type: IntentType.EditTransaction,
        raw,
        amount: extractAmount(raw)?.amount ?? null,
        keywords: this.extractKeywords(raw, EDIT_WORDS),
      };
    }

    // ---- Transaction / amount extraction ----
    // Remove a date phrase first so its digits aren't mistaken for an amount.
    const dateMatch = extractDate(raw, now, tz);
    const occurredAt = dateMatch ? dateMatch.date : now;
    const withoutDate = dateMatch ? this.removeSpan(raw, dateMatch.start, dateMatch.end) : raw;

    const amountMatch = extractAmount(withoutDate);
    const amount = amountMatch?.amount ?? null;
    const withoutAmount = amountMatch
      ? this.removeSpan(withoutDate, amountMatch.start, amountMatch.end)
      : withoutDate;

    const keywords = this.buildKeywords(withoutAmount);
    const description = keywords.length > 0 ? keywords[0] : '';

    const hasExpenseVerb = EXPENSE_VERBS.some((v) =>
      v.includes(' ') ? normalized.includes(v) : tokens.has(v),
    );
    const hasIncome = INCOME_WORDS.some((v) => tokens.has(v));
    const transactionType = hasExpenseVerb
      ? TransactionType.EXPENSE
      : hasIncome
        ? TransactionType.INCOME
        : TransactionType.EXPENSE;

    if (amount !== null) {
      if (description.length === 0) {
        // Bare amount — used to complete a pending clarification.
        return { type: IntentType.AmountOnly, raw, amount };
      }
      return {
        type: IntentType.RecordTransaction,
        raw,
        transactionType,
        amount,
        description,
        keywords,
        occurredAt,
      };
    }

    // No amount: only start a transaction (clarification) when there is a cue.
    if (hasExpenseVerb || hasIncome) {
      return {
        type: IntentType.RecordTransaction,
        raw,
        transactionType,
        amount: null,
        description,
        keywords,
        occurredAt,
      };
    }

    if (GREETING_WORDS.some((w) => tokens.has(w))) {
      return { type: IntentType.Greeting, raw };
    }

    return { type: IntentType.Unknown, raw };
  }

  // ---- Helpers ----

  private detectPeriod(normalized: string): SummaryPeriod {
    if (/\bhari\s*ini\b|\bharian\b|\bhari\b|\btoday\b/.test(normalized)) {
      return SummaryPeriod.Day;
    }
    if (/\bminggu\s*ini\b|\bmingguan\b|\bpekan\b|\bminggu\b/.test(normalized)) {
      return SummaryPeriod.Week;
    }
    // default (also matches "bulan ini"/"bulanan"/"bulan")
    return SummaryPeriod.Month;
  }

  private detectBudgetPeriod(normalized: string): BudgetPeriod {
    if (/\bharian\b|\bhari\b/.test(normalized)) return BudgetPeriod.DAILY;
    if (/\bmingguan\b|\bpekan\b|\bminggu\b/.test(normalized)) return BudgetPeriod.WEEKLY;
    return BudgetPeriod.MONTHLY;
  }

  /** Remove a substring span, replacing it with a space to preserve token gaps. */
  private removeSpan(text: string, start: number, end: number): string {
    return `${text.slice(0, start)} ${text.slice(end)}`;
  }

  /** Tokens of `text` minus stopwords — candidate category keywords. */
  private buildKeywords(text: string): string[] {
    const clean = tokenize(text).filter((t) => !STOPWORDS.has(t) && t.length > 0);
    if (clean.length === 0) return [];
    const phrase = clean.join(' ');
    // Most specific first: full phrase, then individual tokens (deduped).
    return [...new Set([phrase, ...clean])];
  }

  /** Keywords after removing amount + a set of command words. */
  private extractKeywords(raw: string, commandWords: string[]): string[] {
    const amountMatch = extractAmount(raw);
    const withoutAmount = amountMatch
      ? this.removeSpan(raw, amountMatch.start, amountMatch.end)
      : raw;
    const stripped = this.stripWords(withoutAmount, commandWords);
    return this.buildKeywords(stripped);
  }

  /** Remove whole-word occurrences of `words` (and period words) from text. */
  private stripWords(text: string, words: string[]): string {
    const remove = new Set([...words, 'harian', 'mingguan', 'bulanan', 'hari', 'minggu', 'bulan']);
    return tokenize(text)
      .filter((t) => !remove.has(t))
      .join(' ');
  }
}
