import { describe, it, expect } from 'vitest';

import { computeHealthScore } from '../../../src/quality/benchmark/health-score.js';
import { DEFAULT_CONFIG } from '../../../src/config/loader.js';
import type { RuleContext, ContextFile } from '../../../src/quality/rules/types.js';
import type { TokenAnalysis } from '../../../src/quality/benchmark/analyzer.js';
import type { ScenarioResult } from '../../../src/quality/benchmark/scenarios.js';
import type { FileRoi } from '../../../src/quality/benchmark/roi.js';

function makeFile(path: string, tokens: number, frontmatter?: { name?: string; description?: string }): ContextFile {
  return {
    path,
    absolutePath: `/repo/${path}`,
    content: 'x'.repeat(tokens * 4),
    tokens,
    frontmatter: frontmatter ?? null,
    referenced: true,
  };
}

function makeCtx(files: ContextFile[], totalBudget = 8000, perFileBudget = 1500): RuleContext {
  return {
    repoRoot: '/repo',
    claudeMdPath: '/repo/CLAUDE.md',
    claudeMdContent: '# Project',
    contextDir: '/repo/.claude-context',
    contextFiles: files,
    config: {
      ...DEFAULT_CONFIG,
      budgets: { ...DEFAULT_CONFIG.budgets, total: totalBudget, perFile: perFileBudget },
    },
  };
}

describe('computeHealthScore', () => {
  it('gives perfect score for ideal repo', () => {
    const files = [
      makeFile('.claude-context/architecture.md', 500, { name: 'Architecture', description: 'System architecture' }),
      makeFile('.claude-context/code-style.md', 500, { name: 'Code Style', description: 'Code style guide' }),
      makeFile('.claude-context/testing.md', 500, { name: 'Testing', description: 'Testing guide' }),
      makeFile('.claude-context/dev-setup.md', 500, { name: 'Dev Setup', description: 'Development setup' }),
    ];

    const ctx = makeCtx(files, 20000, 1500);

    const tokenAnalysis: TokenAnalysis = {
      claudeMd: { tokens: 200, percentage: 8.3 },
      files: {
        '.claude-context/architecture.md': { tokens: 500, percentage: 20.8 },
        '.claude-context/code-style.md': { tokens: 500, percentage: 20.8 },
        '.claude-context/testing.md': { tokens: 500, percentage: 20.8 },
        '.claude-context/dev-setup.md': { tokens: 500, percentage: 20.8 },
      },
      total: 2400,
      budgetUsage: 12,
    };

    const scenarioResults: ScenarioResult[] = [
      { name: 'Bug fix', filesLoaded: ['CLAUDE.md', '.claude-context/code-style.md'] },
      { name: 'New feature', filesLoaded: ['CLAUDE.md', '.claude-context/architecture.md'] },
      { name: 'Write tests', filesLoaded: ['CLAUDE.md', '.claude-context/testing.md'] },
      { name: 'Code review', filesLoaded: ['CLAUDE.md', '.claude-context/code-style.md'] },
      { name: 'Dev setup', filesLoaded: ['CLAUDE.md', '.claude-context/dev-setup.md'] },
    ];

    const fileRois: FileRoi[] = [
      { file: '.claude-context/code-style.md', tokens: 500, timesLoaded: 2, totalScenarios: 5, roi: 0.8 },
      { file: '.claude-context/architecture.md', tokens: 500, timesLoaded: 1, totalScenarios: 5, roi: 0.4 },
      { file: '.claude-context/testing.md', tokens: 500, timesLoaded: 1, totalScenarios: 5, roi: 0.4 },
      { file: '.claude-context/dev-setup.md', tokens: 500, timesLoaded: 1, totalScenarios: 5, roi: 0.4 },
    ];

    const result = computeHealthScore(tokenAnalysis, scenarioResults, fileRois, ctx);

    expect(result.overall).toBe(100);
    expect(result.breakdown.tokenEfficiency).toBe(30);
    expect(result.breakdown.progressiveDisclosure).toBe(30);
    expect(result.breakdown.fileCoverage).toBe(20);
    expect(result.breakdown.roiDistribution).toBe(20);
  });

  it('scores token efficiency based on budget tiers', () => {
    const files = [makeFile('.claude-context/a.md', 100)];
    const ctx = makeCtx(files, 1000, 1500);

    // Under 50%
    const low: TokenAnalysis = { claudeMd: null, files: {}, total: 400, budgetUsage: 40 };
    const resultLow = computeHealthScore(low, [], [], ctx);
    expect(resultLow.breakdown.tokenEfficiency).toBe(30);

    // 50-75%
    const mid: TokenAnalysis = { claudeMd: null, files: {}, total: 600, budgetUsage: 60 };
    const resultMid = computeHealthScore(mid, [], [], ctx);
    expect(resultMid.breakdown.tokenEfficiency).toBe(20);

    // 75-100%
    const high: TokenAnalysis = { claudeMd: null, files: {}, total: 900, budgetUsage: 90 };
    const resultHigh = computeHealthScore(high, [], [], ctx);
    expect(resultHigh.breakdown.tokenEfficiency).toBe(10);

    // Over 100%
    const over: TokenAnalysis = { claudeMd: null, files: {}, total: 1100, budgetUsage: 110 };
    const resultOver = computeHealthScore(over, [], [], ctx);
    expect(resultOver.breakdown.tokenEfficiency).toBe(0);
  });

  it('scores progressive disclosure based on deferred percentage', () => {
    const files: ContextFile[] = [];
    const ctx = makeCtx(files);

    // >80% deferred
    const highDefer: TokenAnalysis = {
      claudeMd: { tokens: 100, percentage: 10 },
      files: {},
      total: 1000,
      budgetUsage: 10,
    };
    expect(computeHealthScore(highDefer, [], [], ctx).breakdown.progressiveDisclosure).toBe(30);

    // 60-80% deferred
    const midDefer: TokenAnalysis = {
      claudeMd: { tokens: 300, percentage: 30 },
      files: {},
      total: 1000,
      budgetUsage: 10,
    };
    expect(computeHealthScore(midDefer, [], [], ctx).breakdown.progressiveDisclosure).toBe(20);

    // 40-60% deferred
    const lowDefer: TokenAnalysis = {
      claudeMd: { tokens: 500, percentage: 50 },
      files: {},
      total: 1000,
      budgetUsage: 10,
    };
    expect(computeHealthScore(lowDefer, [], [], ctx).breakdown.progressiveDisclosure).toBe(10);

    // <40% deferred (too much in CLAUDE.md)
    const noDefer: TokenAnalysis = {
      claudeMd: { tokens: 700, percentage: 70 },
      files: {},
      total: 1000,
      budgetUsage: 10,
    };
    expect(computeHealthScore(noDefer, [], [], ctx).breakdown.progressiveDisclosure).toBe(0);
  });

  it('does not penalize dead files (orphan detection handles this separately)', () => {
    const files = [makeFile('.claude-context/dead.md', 100)];
    const ctx = makeCtx(files);

    const tokenAnalysis: TokenAnalysis = { claudeMd: null, files: {}, total: 100, budgetUsage: 1 };
    const scenarios: ScenarioResult[] = [
      { name: 'A', filesLoaded: ['CLAUDE.md'] },
      { name: 'B', filesLoaded: ['CLAUDE.md'] },
    ];
    const fileRois: FileRoi[] = [
      { file: '.claude-context/dead.md', tokens: 100, timesLoaded: 0, totalScenarios: 2, roi: 0 },
    ];

    const result = computeHealthScore(tokenAnalysis, scenarios, fileRois, ctx);
    expect(result.breakdown.roiDistribution).toBe(20); // No penalty for dead files
  });

  it('penalizes overloaded files', () => {
    const files = [makeFile('.claude-context/overloaded.md', 100)];
    const ctx = makeCtx(files);

    const tokenAnalysis: TokenAnalysis = { claudeMd: null, files: {}, total: 100, budgetUsage: 1 };
    const scenarios: ScenarioResult[] = [
      { name: 'A', filesLoaded: ['CLAUDE.md', '.claude-context/overloaded.md'] },
      { name: 'B', filesLoaded: ['CLAUDE.md', '.claude-context/overloaded.md'] },
    ];
    const fileRois: FileRoi[] = [
      { file: '.claude-context/overloaded.md', tokens: 100, timesLoaded: 2, totalScenarios: 2, roi: 10 },
    ];

    const result = computeHealthScore(tokenAnalysis, scenarios, fileRois, ctx);
    expect(result.breakdown.roiDistribution).toBe(15); // 20 - 5 for overloaded
  });

  it('clamps score to 0-100', () => {
    const files: ContextFile[] = [];
    const ctx = makeCtx(files);

    // All zeros
    const zeroAnalysis: TokenAnalysis = { claudeMd: null, files: {}, total: 0, budgetUsage: 0 };
    const result = computeHealthScore(zeroAnalysis, [], [], ctx);
    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.overall).toBeLessThanOrEqual(100);
  });

  it('applies per-file budget penalty', () => {
    const files = [makeFile('.claude-context/big.md', 2000)]; // over 1500 per-file budget
    const ctx = makeCtx(files, 20000, 1500);

    const tokenAnalysis: TokenAnalysis = {
      claudeMd: null,
      files: { '.claude-context/big.md': { tokens: 2000, percentage: 100 } },
      total: 2000,
      budgetUsage: 10,
    };

    const result = computeHealthScore(tokenAnalysis, [], [], ctx);
    // Would be 30 for token efficiency, but -5 for per-file overage = 25
    expect(result.breakdown.tokenEfficiency).toBe(25);
  });
});
