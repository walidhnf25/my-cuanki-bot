import { normalizeText, tokenize } from 'src/shared/utils/string-normalizer';

export interface CompiledSchedule {
  /** Standard 5-field cron expression (minute hour day-of-month month day-of-week). */
  cronExpression: string;
  /** Indonesian description, e.g. "setiap tanggal 5 jam 08:00". */
  humanReadable: string;
}

const WEEKDAY_CRON: Record<string, number> = {
  minggu: 0,
  senin: 1,
  selasa: 2,
  rabu: 3,
  kamis: 4,
  jumat: 5,
  sabtu: 6,
};

const WEEKDAY_LABEL: Record<string, string> = {
  minggu: 'Minggu',
  senin: 'Senin',
  selasa: 'Selasa',
  rabu: 'Rabu',
  kamis: 'Kamis',
  jumat: 'Jumat',
  sabtu: 'Sabtu',
};

const clamp = (n: number, min: number, max: number): number => Math.min(Math.max(n, min), max);
const pad = (n: number): string => n.toString().padStart(2, '0');

interface TimeOfDay {
  hour: number;
  minute: number;
}

/** Extract the time of day (default 08:00). Understands "jam 7", "jam 19:30", pagi/siang/sore/malam. */
function extractTime(text: string): TimeOfDay {
  const m = text.match(/jam\s*(\d{1,2})(?:[:.](\d{2}))?/);
  if (m) {
    return {
      hour: clamp(parseInt(m[1], 10), 0, 23),
      minute: m[2] ? clamp(parseInt(m[2], 10), 0, 59) : 0,
    };
  }
  if (/\bpagi\b/.test(text)) return { hour: 7, minute: 0 };
  if (/\bsiang\b/.test(text)) return { hour: 12, minute: 0 };
  if (/\bsore\b/.test(text)) return { hour: 16, minute: 0 };
  if (/\bmalam\b/.test(text)) return { hour: 20, minute: 0 };
  return { hour: 8, minute: 0 };
}

/**
 * Compile an Indonesian schedule phrase into a cron expression. Supports:
 * - monthly:  "tiap tanggal 5"  -> `0 8 5 * *`
 * - weekly:   "tiap senin"      -> `0 8 * * 1`
 * - daily:    "tiap hari [jam H]" or a bare time -> `M H * * *`
 * Returns null when no recurrence can be determined.
 */
export function compileSchedule(phrase: string): CompiledSchedule | null {
  const text = normalizeText(phrase);
  const { hour, minute } = extractTime(text);
  const hhmm = `${pad(hour)}:${pad(minute)}`;
  const hasTime = /jam\s*\d|pagi|siang|sore|malam/.test(text);

  const dateMatch = text.match(/tanggal\s*(\d{1,2})/);
  if (dateMatch) {
    const day = clamp(parseInt(dateMatch[1], 10), 1, 28);
    return {
      cronExpression: `${minute} ${hour} ${day} * *`,
      humanReadable: `setiap tanggal ${day} jam ${hhmm}`,
    };
  }

  for (const [name, dow] of Object.entries(WEEKDAY_CRON)) {
    if (new RegExp(`\\b${name}\\b`).test(text)) {
      return {
        cronExpression: `${minute} ${hour} * * ${dow}`,
        humanReadable: `setiap ${WEEKDAY_LABEL[name]} jam ${hhmm}`,
      };
    }
  }

  if (/\b(hari|harian)\b/.test(text) || hasTime) {
    return { cronExpression: `${minute} ${hour} * * *`, humanReadable: `setiap hari jam ${hhmm}` };
  }

  return null;
}

const TITLE_STOPWORDS = new Set([
  'ingatkan',
  'ingetin',
  'reminder',
  'remind',
  'ingat',
  'tiap',
  'setiap',
  'tanggal',
  'jam',
  'pagi',
  'siang',
  'sore',
  'malam',
  'hari',
  'harian',
  'setiap hari',
  ...Object.keys(WEEKDAY_CRON),
]);

/** Strip schedule/command words (and bare numbers) to get a clean reminder title. */
export function cleanTitle(raw: string): string {
  const tokens = tokenize(raw).filter((t) => !TITLE_STOPWORDS.has(t) && !/^\d+([:.]\d+)?$/.test(t));
  const title = tokens.join(' ').trim();
  return title.length > 0 ? title : 'Pengingat';
}
