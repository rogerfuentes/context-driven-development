import { describe, it, expect } from 'vitest';
import { checkEfficiency } from '../../../src/quality/rules/efficiency.js';
import type { RuleContext, ContextFile } from '../../../src/quality/rules/types.js';
import { DEFAULT_CONFIG } from '../../../src/config/loader.js';

function makeFile(path: string, tokenCount: number, referenced = true): ContextFile {
  // Create content of appropriate length to match tokenCount (chars = tokens * 4)
  const content = 'x '.repeat(tokenCount * 2);
  return {
    path,
    absolutePath: `/tmp/test/${path}`,
    content,
    tokens: tokenCount,
    frontmatter: null,
    referenced,
  };
}

function makeCtx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    repoRoot: '/tmp/test',
    claudeMdPath: '/tmp/test/CLAUDE.md',
    claudeMdContent: '',
    contextDir: null,
    contextFiles: [],
    config: DEFAULT_CONFIG,
    ...overrides,
  };
}

describe('checkEfficiency', () => {
  it('flags CLAUDE.md over token budget', () => {
    const ctx = makeCtx({
      claudeMdContent: 'x'.repeat(DEFAULT_CONFIG.budgets.claudeMd * 4 + 100),
    });
    const findings = checkEfficiency(ctx);
    const budgetFindings = findings.filter((f) => f.rule === 'claude-md-budget');
    expect(budgetFindings.length).toBe(1);
    expect(budgetFindings[0].severity).toBe('warning');
  });

  it('does not flag CLAUDE.md under budget', () => {
    const ctx = makeCtx({
      claudeMdContent: 'x'.repeat(100),
    });
    const findings = checkEfficiency(ctx);
    expect(findings.filter((f) => f.rule === 'claude-md-budget').length).toBe(0);
  });

  it('flags individual files over per-file budget', () => {
    const ctx = makeCtx({
      contextFiles: [makeFile('big.md', DEFAULT_CONFIG.budgets.perFile + 100)],
    });
    const findings = checkEfficiency(ctx);
    const budgetFindings = findings.filter((f) => f.rule === 'per-file-budget');
    expect(budgetFindings.length).toBe(1);
  });

  it('flags total over budget as info when budget is set', () => {
    const totalBudget = 8000;
    const perFile = Math.floor(totalBudget / 2) + 100;
    const ctx = makeCtx({
      contextFiles: [
        makeFile('a.md', perFile),
        makeFile('b.md', perFile),
      ],
      config: { ...DEFAULT_CONFIG, budgets: { ...DEFAULT_CONFIG.budgets, total: totalBudget } },
    });
    const findings = checkEfficiency(ctx);
    const totalFindings = findings.filter((f) => f.rule === 'total-budget');
    expect(totalFindings.length).toBe(1);
    expect(totalFindings[0].severity).toBe('info');
  });

  it('skips total budget check when total is 0 (disabled)', () => {
    const ctx = makeCtx({
      contextFiles: [
        makeFile('a.md', 50000),
        makeFile('b.md', 50000),
      ],
    });
    const findings = checkEfficiency(ctx);
    expect(findings.filter((f) => f.rule === 'total-budget').length).toBe(0);
  });

  it('detects duplicate content via Jaccard similarity', () => {
    const sharedContent = 'the quick brown fox jumped over the lazy dog and then some more words';
    const ctx = makeCtx({
      contextFiles: [
        {
          path: 'a.md',
          absolutePath: '/tmp/test/a.md',
          content: sharedContent + ' file a extra',
          tokens: 20,
          frontmatter: null,
          referenced: true,
        },
        {
          path: 'b.md',
          absolutePath: '/tmp/test/b.md',
          content: sharedContent + ' file b extra',
          tokens: 20,
          frontmatter: null,
          referenced: true,
        },
      ],
    });
    const findings = checkEfficiency(ctx);
    expect(findings.filter((f) => f.rule === 'content-duplication').length).toBe(1);
  });

  it('no false positives on unrelated content', () => {
    const ctx = makeCtx({
      contextFiles: [
        {
          path: 'a.md',
          absolutePath: '/tmp/test/a.md',
          content: 'typescript react component patterns architecture design',
          tokens: 10,
          frontmatter: null,
          referenced: true,
        },
        {
          path: 'b.md',
          absolutePath: '/tmp/test/b.md',
          content: 'python django database migration deployment security',
          tokens: 10,
          frontmatter: null,
          referenced: true,
        },
      ],
    });
    const findings = checkEfficiency(ctx);
    expect(findings.filter((f) => f.rule === 'content-duplication').length).toBe(0);
  });
});
