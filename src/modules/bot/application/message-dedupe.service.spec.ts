import { MessageDedupeService } from './message-dedupe.service';

describe('MessageDedupeService', () => {
  it('detects duplicates', () => {
    const dedupe = new MessageDedupeService();
    expect(dedupe.isDuplicate('a')).toBe(false);
    expect(dedupe.isDuplicate('a')).toBe(true);
    expect(dedupe.isDuplicate('b')).toBe(false);
  });

  it('treats empty ids as never-duplicate', () => {
    const dedupe = new MessageDedupeService();
    expect(dedupe.isDuplicate('')).toBe(false);
    expect(dedupe.isDuplicate('')).toBe(false);
  });
});
