import { Money } from 'src/shared/utils/money';

export interface AmountMatch {
  amount: Money;
  /** The exact matched substring (used to strip it from the description). */
  text: string;
  start: number;
  end: number;
}

/** Unit suffix -> multiplier. */
const UNIT_MULTIPLIER: Record<string, number> = {
  juta: 1_000_000,
  jt: 1_000_000,
  ribu: 1_000,
  rb: 1_000,
  k: 1_000,
};

// number + REQUIRED unit; the unit must not be glued to another letter so
// "25kg" is not read as 25000 (the k there is part of "kg", not "ribu").
const UNIT_AMOUNT_RE = /(\d[\d.,]*)\s*(juta|jt|ribu|rb|k)(?![a-z])/gi;
// bare number fallback.
const PLAIN_AMOUNT_RE = /\d[\d.,]*/g;

/**
 * Convert an Indonesian-formatted numeric string to a number.
 * Rules: comma = decimal separator, dot = thousands separator. A single dot with
 * 1–2 trailing digits is treated as a decimal (e.g. "1.5jt").
 */
export function parseIndonesianNumber(raw: string): number {
  if (raw.includes(',')) {
    return Number(raw.replace(/\./g, '').replace(',', '.'));
  }
  const dotCount = (raw.match(/\./g) ?? []).length;
  if (dotCount === 1) {
    const [intPart, fracPart] = raw.split('.');
    if (fracPart.length === 3) {
      return Number(intPart + fracPart); // thousands, e.g. "25.000"
    }
    return Number(`${intPart}.${fracPart}`); // decimal, e.g. "1.5"
  }
  if (dotCount > 1) {
    return Number(raw.replace(/\./g, '')); // "1.500.000"
  }
  return Number(raw);
}

function build(
  numStr: string,
  unit: string | undefined,
  full: string,
  index: number,
): AmountMatch | null {
  const value = parseIndonesianNumber(numStr);
  if (!Number.isFinite(value) || value <= 0) return null;
  const multiplier = unit ? UNIT_MULTIPLIER[unit.toLowerCase()] : 1;
  const trimmed = full.trimEnd();
  return {
    amount: Money.fromMajor(value * multiplier),
    text: trimmed,
    start: index,
    end: index + trimmed.length,
  };
}

/**
 * Find the first monetary amount in `text`. Prefers a number carrying a unit
 * (25rb, 2jt, 100k) over a bare number. Handles: 25000, 25.000, "25 ribu",
 * "2 juta", "1,5jt", "Rp 25.000".
 */
export function extractAmount(text: string): AmountMatch | null {
  // Blank out the currency prefix "Rp"/"rp" (same length keeps indices stable).
  const cleaned = text.replace(/rp\.?\s*/gi, (m) => ' '.repeat(m.length));

  UNIT_AMOUNT_RE.lastIndex = 0;
  const unitMatch = UNIT_AMOUNT_RE.exec(cleaned);
  if (unitMatch) {
    const result = build(unitMatch[1], unitMatch[2], unitMatch[0], unitMatch.index);
    if (result) return result;
  }

  PLAIN_AMOUNT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PLAIN_AMOUNT_RE.exec(cleaned)) !== null) {
    const numStr = m[0].replace(/[.,]+$/, ''); // drop trailing separators
    const result = build(numStr, undefined, numStr, m.index);
    if (result) return result;
  }
  return null;
}
