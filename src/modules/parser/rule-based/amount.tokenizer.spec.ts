import { extractAmount, parseIndonesianNumber } from './amount.tokenizer';

describe('parseIndonesianNumber', () => {
  it.each([
    ['25000', 25000],
    ['25.000', 25000],
    ['1.500.000', 1_500_000],
    ['1,5', 1.5],
    ['25.000,50', 25000.5],
    ['1.5', 1.5],
    ['100', 100],
  ])('parses "%s" -> %d', (input, expected) => {
    expect(parseIndonesianNumber(input)).toBe(expected);
  });
});

describe('extractAmount', () => {
  const cases: Array<[string, number]> = [
    ['25rb', 25000],
    ['25 rb', 25000],
    ['25 ribu', 25000],
    ['25000', 25000],
    ['25.000', 25000],
    ['2 juta', 2_000_000],
    ['2jt', 2_000_000],
    ['100k', 100_000],
    ['1,5jt', 1_500_000],
    ['1.5jt', 1_500_000],
    ['Rp 25.000', 25000],
    ['rp25000', 25000],
    ['beli kopi 25rb', 25000],
    ['isi bensin 100rb', 100_000],
    ['gaji 8 juta', 8_000_000],
  ];

  it.each(cases)('extracts amount from "%s" -> %d', (text, expected) => {
    const match = extractAmount(text);
    expect(match).not.toBeNull();
    expect(match!.amount.toNumber()).toBe(expected);
  });

  it('returns null when no amount present', () => {
    expect(extractAmount('beli kopi')).toBeNull();
    expect(extractAmount('ringkasan bulan ini')).toBeNull();
  });

  it('does not read "25kg" as an amount with k-unit', () => {
    const match = extractAmount('beras 25kg');
    expect(match?.amount.toNumber()).toBe(25);
  });

  it('reports the matched span for stripping', () => {
    const match = extractAmount('beli kopi 25rb');
    expect(match).not.toBeNull();
    expect('beli kopi 25rb'.slice(match!.start, match!.end)).toBe('25rb');
  });
});
