import { describe, it, expect } from 'vitest';
import { computeScore, computeCleanliness, computeCompleteness } from '../../src/quality/scorer.js';
import type { Finding, RuleContext } from '../../src/quality/rules/types.js';

function makeFinding(severity: 'error' | 'warning' | 'info'): Finding {
  return { severity, rule: 'test', message: 'test finding' };
}

function makeCtx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    repoRoot: '/tmp/test',
    claudeMdPath: null,
    claudeMdContent: null,
    contextDir: null,
    contextFiles: [],
    config: {
      contextDir: '.claude/context',
      budgets: { claudeMd: 2000, perFile: 1500, perFileMin: 200, perLevel3File: 800, total: 0 },
      thresholds: { jaccardDuplication: 0.6, maxAnnotations: 3, codeToProseRatio: 0.3 },
      rules: {},
    },
    ...overrides,
  };
}

describe('computeCleanliness', () => {
  it('starts at 100 with no findings', () => {
    expect(computeCleanliness([])).toBe(100);
  });

  it('reduces by 10 for each error', () => {
    expect(computeCleanliness([makeFinding('error'), makeFinding('error')])).toBe(80);
  });

  it('reduces by 3 for each warning', () => {
    expect(computeCleanliness([makeFinding('warning'), makeFinding('warning')])).toBe(94);
  });

  it('does not reduce for info findings', () => {
    expect(computeCleanliness([makeFinding('info'), makeFinding('info')])).toBe(100);
  });

  it('does not go below 0', () => {
    const findings = Array.from({ length: 15 }, () => makeFinding('error'));
    expect(computeCleanliness(findings)).toBe(0);
  });
});

describe('computeCompleteness', () => {
  it('returns 0 for empty repo (no CLAUDE.md, no context)', () => {
    expect(computeCompleteness(makeCtx())).toBe(0);
  });

  it('gives 15 for just CLAUDE.md existing', () => {
    const ctx = makeCtx({ claudeMdContent: '# CLAUDE.md\nShort.' });
    expect(computeCompleteness(ctx)).toBe(15);
  });

  it('gives bonus for CLAUDE.md >= 50 lines', () => {
    const lines = Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n');
    const ctx = makeCtx({ claudeMdContent: lines });
    expect(computeCompleteness(ctx)).toBe(25); // 15 (exists) + 10 (>=50 lines)
  });

  it('gives bonus for commands table', () => {
    const content = '# CLAUDE.md\n\n## Commands\n\n| Command | Desc |\n|---|---|\n| pnpm build | Build |';
    const ctx = makeCtx({ claudeMdContent: content });
    expect(computeCompleteness(ctx)).toBe(25); // 15 + 10 (commands)
  });

  it('gives bonus for progressive disclosure table', () => {
    const content = '# CLAUDE.md\n\n| File | Load When |\n|---|---|';
    const ctx = makeCtx({ claudeMdContent: content });
    expect(computeCompleteness(ctx)).toBe(25); // 15 + 10 (progressive disclosure)
  });

  it('gives 15 for context directory', () => {
    const ctx = makeCtx({
      claudeMdContent: '# CLAUDE.md',
      contextDir: '/tmp/test/.claude/context',
    });
    expect(computeCompleteness(ctx)).toBe(30); // 15 (claude.md) + 15 (dir)
  });

  it('gives partial credit for 1-2 context files', () => {
    const ctx = makeCtx({
      claudeMdContent: '# CLAUDE.md',
      contextFiles: [
        { path: 'a.md', absolutePath: '/a.md', content: '', tokens: 100, frontmatter: null, referenced: false },
      ],
    });
    const score = computeCompleteness(ctx);
    // 15 (claude.md) + 5 (1 file partial) + some orphan partial
    expect(score).toBeGreaterThan(15);
    expect(score).toBeLessThan(50);
  });

  it('gives full credit for >= 3 context files', () => {
    const makeFile = (name: string, referenced: boolean) => ({
      path: name, absolutePath: `/${name}`, content: '# Test', tokens: 100,
      frontmatter: { name, description: 'desc' }, referenced,
    });
    const ctx = makeCtx({
      claudeMdContent: '# CLAUDE.md',
      contextDir: '/tmp/test/.claude/context',
      contextFiles: [makeFile('a.md', true), makeFile('b.md', true), makeFile('c.md', true)],
    });
    // 15 (claude.md) + 15 (dir) + 15 (>=3 files) + 10 (frontmatter) + 15 (no orphans)
    expect(computeCompleteness(ctx)).toBe(70);
  });

  it('scores near 100 for a fully complete setup', () => {
    const lines = Array.from({ length: 60 }, (_, i) => `line ${i}`);
    lines.push('## Commands', '| Command | Desc |', '|---|---|', '| pnpm build | Build |');
    lines.push('| File | Load When |', '|---|---|');
    const content = lines.join('\n');

    const makeFile = (name: string) => ({
      path: name, absolutePath: `/${name}`, content: '# Test', tokens: 100,
      frontmatter: { name, description: 'desc' }, referenced: true,
    });
    const ctx = makeCtx({
      claudeMdContent: content,
      contextDir: '/tmp/test/.claude/context',
      contextFiles: [makeFile('a.md'), makeFile('b.md'), makeFile('c.md')],
    });
    expect(computeCompleteness(ctx)).toBe(100);
  });
});

describe('computeScore (composite)', () => {
  it('without ctx, falls back to cleanliness only', () => {
    expect(computeScore([])).toBe(100);
    expect(computeScore([makeFinding('error')])).toBe(90);
  });

  it('empty repo with no findings scores low (completeness = 0)', () => {
    const ctx = makeCtx();
    // completeness=0, cleanliness=100 → 0*0.6 + 100*0.4 = 40
    expect(computeScore([], ctx)).toBe(40);
  });

  it('full setup with no findings scores high', () => {
    const lines = Array.from({ length: 60 }, (_, i) => `line ${i}`);
    lines.push('## Commands', '| Command | Desc |', '|---|---|');
    lines.push('| File | Load When |', '|---|---|');
    const content = lines.join('\n');

    const makeFile = (name: string) => ({
      path: name, absolutePath: `/${name}`, content: '# Test', tokens: 100,
      frontmatter: { name, description: 'desc' }, referenced: true,
    });
    const ctx = makeCtx({
      claudeMdContent: content,
      contextDir: '/tmp/test/.claude/context',
      contextFiles: [makeFile('a.md'), makeFile('b.md'), makeFile('c.md')],
    });
    // completeness=100, cleanliness=100 → 100
    expect(computeScore([], ctx)).toBe(100);
  });

  it('full setup with warnings still scores well', () => {
    const lines = Array.from({ length: 60 }, (_, i) => `line ${i}`);
    lines.push('## Commands', '| Command | Desc |', '|---|---|');
    lines.push('| File | Load When |', '|---|---|');
    const content = lines.join('\n');

    const makeFile = (name: string) => ({
      path: name, absolutePath: `/${name}`, content: '# Test', tokens: 100,
      frontmatter: { name, description: 'desc' }, referenced: true,
    });
    const ctx = makeCtx({
      claudeMdContent: content,
      contextDir: '/tmp/test/.claude/context',
      contextFiles: [makeFile('a.md'), makeFile('b.md'), makeFile('c.md')],
    });
    const findings = [makeFinding('warning'), makeFinding('warning')];
    // completeness=100, cleanliness=94 → 100*0.6 + 94*0.4 = 97.6 → 98
    expect(computeScore(findings, ctx)).toBe(98);
  });

  it('bare CLAUDE.md with no findings scores moderate', () => {
    const ctx = makeCtx({ claudeMdContent: '# CLAUDE.md\nShort file.' });
    // completeness=15, cleanliness=100 → 15*0.6 + 100*0.4 = 49
    expect(computeScore([], ctx)).toBe(49);
  });
});
