import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const TMP_DIR = join(process.cwd(), '__tests__', '.tmp-health');

describe('health command (integration)', () => {
  beforeEach(async () => {
    await mkdir(join(TMP_DIR, '.git'), { recursive: true });
    await mkdir(join(TMP_DIR, '.claude/context'), { recursive: true });
  });

  afterEach(async () => {
    await rm(TMP_DIR, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('produces a valid health check against fixture directory', async () => {
    // Create CLAUDE.md
    await writeFile(join(TMP_DIR, 'CLAUDE.md'), '# My Project\n\nProject description.\n');

    // Create context files covering standard topics
    await writeFile(
      join(TMP_DIR, '.claude/context', 'architecture.md'),
      '---\nname: Architecture\ndescription: System architecture and design patterns\n---\n# Architecture\nModule design patterns and component structure.\n',
    );
    await writeFile(
      join(TMP_DIR, '.claude/context', 'testing.md'),
      '---\nname: Testing\ndescription: Testing patterns\n---\n# Testing\nUse vitest for testing. Mock external dependencies.\n',
    );

    const { scanRepo } = await import('../../src/quality/scanner.js');
    const { analyzeTokens } = await import('../../src/quality/benchmark/analyzer.js');
    const { simulateScenarios } = await import('../../src/quality/benchmark/scenarios.js');
    const { calculateRoi } = await import('../../src/quality/benchmark/roi.js');
    const { computeHealthScore } = await import('../../src/quality/benchmark/health-score.js');

    const ctx = await scanRepo(TMP_DIR);
    const tokenAnalysis = analyzeTokens(ctx);
    const scenarioResults = simulateScenarios(ctx);
    const fileRois = calculateRoi(ctx, scenarioResults);
    const healthScore = computeHealthScore(tokenAnalysis, scenarioResults, fileRois, ctx);

    expect(healthScore.overall).toBeGreaterThan(0);
    expect(healthScore.overall).toBeLessThanOrEqual(100);
    expect(tokenAnalysis.total).toBeGreaterThan(0);
    expect(scenarioResults.length).toBe(5);
  });

  it('produces valid JSON output', async () => {
    await writeFile(join(TMP_DIR, 'CLAUDE.md'), '# My Project\n\nContent.\n');
    await writeFile(
      join(TMP_DIR, '.claude/context', 'code-style.md'),
      '---\nname: Code Style\ndescription: Code style conventions\n---\n# Code Style\nFollow conventions and patterns.\n',
    );

    const { scanRepo } = await import('../../src/quality/scanner.js');
    const { analyzeTokens } = await import('../../src/quality/benchmark/analyzer.js');
    const { simulateScenarios } = await import('../../src/quality/benchmark/scenarios.js');
    const { calculateRoi } = await import('../../src/quality/benchmark/roi.js');
    const { computeHealthScore } = await import('../../src/quality/benchmark/health-score.js');
    const { formatJsonBenchmarkReport } = await import('../../src/quality/benchmark/report.js');
    const { loadHistory } = await import('../../src/quality/benchmark/history.js');

    const ctx = await scanRepo(TMP_DIR);
    const tokenAnalysis = analyzeTokens(ctx);
    const scenarioResults = simulateScenarios(ctx);
    const fileRois = calculateRoi(ctx, scenarioResults);
    const healthScore = computeHealthScore(tokenAnalysis, scenarioResults, fileRois, ctx);
    const history = await loadHistory(TMP_DIR);

    const claudeMdTokens = tokenAnalysis.claudeMd?.tokens ?? 0;
    const progressiveDisclosure = tokenAnalysis.total > 0
      ? ((tokenAnalysis.total - claudeMdTokens) / tokenAnalysis.total) * 100
      : 0;

    const json = formatJsonBenchmarkReport({
      repoName: 'test-repo',
      score: healthScore,
      tokenAnalysis,
      scenarioResults,
      fileRois,
      history,
      progressiveDisclosure,
    });

    const parsed = JSON.parse(json);
    expect(parsed.repo).toBe('test-repo');
    expect(typeof parsed.score).toBe('number');
    expect(parsed.version).toBe('0.1.0');
    expect(parsed.timestamp).toBeDefined();
    expect(parsed.breakdown).toBeDefined();
    expect(parsed.tokenDistribution).toBeDefined();
    expect(Array.isArray(parsed.scenarios)).toBe(true);
    expect(Array.isArray(parsed.fileRoi)).toBe(true);
    expect(Array.isArray(parsed.deadFiles)).toBe(true);
    expect(Array.isArray(parsed.overloadedFiles)).toBe(true);
    expect(typeof parsed.progressiveDisclosure).toBe('number');
    expect(parsed.trend).toBeDefined();
  });

  it('creates history file after health run', async () => {
    await writeFile(join(TMP_DIR, 'CLAUDE.md'), '# Project\n');

    const { scanRepo } = await import('../../src/quality/scanner.js');
    const { analyzeTokens } = await import('../../src/quality/benchmark/analyzer.js');
    const { simulateScenarios } = await import('../../src/quality/benchmark/scenarios.js');
    const { calculateRoi } = await import('../../src/quality/benchmark/roi.js');
    const { computeHealthScore } = await import('../../src/quality/benchmark/health-score.js');
    const { loadHistory, saveHistory } = await import('../../src/quality/benchmark/history.js');

    const ctx = await scanRepo(TMP_DIR);
    const tokenAnalysis = analyzeTokens(ctx);
    const scenarioResults = simulateScenarios(ctx);
    const fileRois = calculateRoi(ctx, scenarioResults);
    const healthScore = computeHealthScore(tokenAnalysis, scenarioResults, fileRois, ctx);
    const history = await loadHistory(TMP_DIR);

    await saveHistory(TMP_DIR, {
      timestamp: new Date().toISOString(),
      score: healthScore.overall,
      version: '0.1.0',
      tokenTotal: tokenAnalysis.total,
      fileCount: ctx.contextFiles.length,
    }, history);

    const historyPath = join(TMP_DIR, '.cdd', 'health-history.json');
    const raw = await readFile(historyPath, 'utf-8');
    const parsed = JSON.parse(raw);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(typeof parsed[0].score).toBe('number');
    expect(typeof parsed[0].timestamp).toBe('string');
  });
});
