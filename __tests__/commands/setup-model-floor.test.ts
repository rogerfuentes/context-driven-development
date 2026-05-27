import { describe, it, expect } from 'vitest';

import { meetsModelFloor } from '../../src/commands/setup.js';

describe('meetsModelFloor', () => {
  it('accepts claude-opus-4-7', () => {
    expect(meetsModelFloor('claude-opus-4-7')).toBe(true);
  });

  it('accepts newer Opus versions', () => {
    expect(meetsModelFloor('claude-opus-4-8')).toBe(true);
    expect(meetsModelFloor('claude-opus-5-0')).toBe(true);
    expect(meetsModelFloor('claude-opus-10-2')).toBe(true);
  });

  it('accepts Opus model IDs with date suffixes', () => {
    expect(meetsModelFloor('claude-opus-4-7-20260101')).toBe(true);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(meetsModelFloor('  CLAUDE-OPUS-4-7  ')).toBe(true);
  });

  it('rejects older Opus versions', () => {
    expect(meetsModelFloor('claude-opus-4-6')).toBe(false);
    expect(meetsModelFloor('claude-opus-3-5')).toBe(false);
  });

  it('rejects Sonnet and Haiku at any version', () => {
    expect(meetsModelFloor('claude-sonnet-4-6')).toBe(false);
    expect(meetsModelFloor('claude-sonnet-5-0')).toBe(false);
    expect(meetsModelFloor('claude-haiku-4-5')).toBe(false);
  });

  it('rejects unknown / non-Claude models', () => {
    expect(meetsModelFloor('sonnet')).toBe(false);
    expect(meetsModelFloor('opus')).toBe(false);
    expect(meetsModelFloor('gpt-5')).toBe(false);
    expect(meetsModelFloor('')).toBe(false);
  });
});
