import { describe, it, expect } from 'vitest';
import { estimateTokens } from '../../src/quality/token-counter.js';

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('estimates tokens for known length strings', () => {
    // 100 chars / 4 = 25 tokens
    const text = 'a'.repeat(100);
    expect(estimateTokens(text)).toBe(25);
  });

  it('rounds up for non-divisible lengths', () => {
    // 10 chars / 4 = 2.5 → 3
    expect(estimateTokens('0123456789')).toBe(3);
  });

  it('handles single character', () => {
    expect(estimateTokens('x')).toBe(1);
  });

  it('handles multiline text', () => {
    const text = 'line one\nline two\nline three\n';
    expect(estimateTokens(text)).toBe(Math.ceil(text.length / 4));
  });
});
