import { describe, it, expect } from 'vitest';
import { formatElapsed } from './elapsedFormat';

describe('formatElapsed', () => {
  it('formats seconds', () => {
    expect(formatElapsed(0)).toBe('0s');
    expect(formatElapsed(1000)).toBe('1s');
    expect(formatElapsed(42000)).toBe('42s');
    expect(formatElapsed(59000)).toBe('59s');
  });

  it('formats minutes and seconds', () => {
    expect(formatElapsed(60_000)).toBe('1m 00s');
    expect(formatElapsed(185_000)).toBe('3m 05s');
    expect(formatElapsed(3_599_000)).toBe('59m 59s');
  });

  it('formats hours', () => {
    expect(formatElapsed(3_600_000)).toBe('1h 00m 00s');
    expect(formatElapsed(3_852_000)).toBe('1h 04m 12s');
    expect(formatElapsed(7_200_000)).toBe('2h 00m 00s');
  });

  it('formats days', () => {
    expect(formatElapsed(86_400_000)).toBe('1d 0h 0m');
    expect(formatElapsed(2 * 86_400_000 + 3 * 3_600_000 + 10 * 60_000)).toBe('2d 3h 10m');
  });

  it('clamps negative and non-finite', () => {
    expect(formatElapsed(-100)).toBe('0s');
    expect(formatElapsed(Number.NaN)).toBe('0s');
  });
});
