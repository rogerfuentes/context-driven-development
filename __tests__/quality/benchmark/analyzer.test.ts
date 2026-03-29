import { describe, it, expect } from 'vitest';

import { analyzeTokens } from '../../../src/quality/benchmark/analyzer.js';
import { DEFAULT_CONFIG } from '../../../src/config/loader.js';
import type { RuleContext } from '../../../src/quality/rules/types.js';

function makeCtx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    repoRoot: '/repo',
    claudeMdPath: '/repo/CLAUDE.md',
    claudeMdContent: '# Project\nSome content here.',
    contextDir: '/repo/.claude-context',
    contextFiles: [],
    config: { ...DEFAULT_CONFIG },
    ...overrides,
  };
}

describe('analyzeTokens', () => {
  it('calculates token distribution correctly', () => {
    const ctx = makeCtx({
      claudeMdContent: 'a'.repeat(400), // ~100 tokens
      contextFiles: [
        {
          path: '.claude-context/arch.md',
          absolutePath: '/repo/.claude-context/arch.md',
          content: 'b'.repeat(800), // ~200 tokens
          tokens: 200,
          frontmatter: null,
          referenced: true,
        },
        {
          path: '.claude-context/style.md',
          absolutePath: '/repo/.claude-context/style.md',
          content: 'c'.repeat(1200), // ~300 tokens
          tokens: 300,
          frontmatter: null,
          referenced: true,
        },
      ],
    });

    const result = analyzeTokens(ctx);

    expect(result.total).toBe(600); // 100 + 200 + 300
    expect(result.claudeMd).not.toBeNull();
    expect(result.claudeMd!.tokens).toBe(100);
    expect(result.claudeMd!.percentage).toBeCloseTo(16.67, 1);
    expect(result.files['.claude-context/arch.md'].tokens).toBe(200);
    expect(result.files['.claude-context/style.md'].tokens).toBe(300);
  });

  it('handles missing CLAUDE.md', () => {
    const ctx = makeCtx({
      claudeMdPath: null,
      claudeMdContent: null,
      contextFiles: [
        {
          path: '.claude-context/arch.md',
          absolutePath: '/repo/.claude-context/arch.md',
          content: 'b'.repeat(400),
          tokens: 100,
          frontmatter: null,
          referenced: true,
        },
      ],
    });

    const result = analyzeTokens(ctx);

    expect(result.claudeMd).toBeNull();
    expect(result.total).toBe(100);
  });

  it('calculates budget usage correctly', () => {
    const ctx = makeCtx({
      claudeMdContent: 'a'.repeat(4000), // ~1000 tokens
      contextFiles: [
        {
          path: '.claude-context/big.md',
          absolutePath: '/repo/.claude-context/big.md',
          content: 'b'.repeat(12000), // ~3000 tokens
          tokens: 3000,
          frontmatter: null,
          referenced: true,
        },
      ],
      config: { ...DEFAULT_CONFIG, budgets: { ...DEFAULT_CONFIG.budgets, total: 8000 } },
    });

    const result = analyzeTokens(ctx);

    // 4000 total tokens / 8000 budget = 50%
    expect(result.budgetUsage).toBe(50);
  });

  it('handles empty repo', () => {
    const ctx = makeCtx({
      claudeMdPath: null,
      claudeMdContent: null,
      contextFiles: [],
    });

    const result = analyzeTokens(ctx);

    expect(result.total).toBe(0);
    expect(result.budgetUsage).toBe(0);
    expect(result.claudeMd).toBeNull();
    expect(Object.keys(result.files)).toHaveLength(0);
  });
});
