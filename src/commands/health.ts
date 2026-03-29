import { access } from 'node:fs/promises';
import { basename, join } from 'node:path';

import pc from 'picocolors';

import { analyzeTokens } from '../quality/benchmark/analyzer.js';
import { computeHealthScore } from '../quality/benchmark/health-score.js';
import { loadHistory, saveHistory } from '../quality/benchmark/history.js';
import type { BenchmarkReportData } from '../quality/benchmark/report.js';
import {
  formatHumanBenchmarkReport,
  formatJsonBenchmarkReport,
} from '../quality/benchmark/report.js';
import { calculateRoi } from '../quality/benchmark/roi.js';
import { simulateScenarios } from '../quality/benchmark/scenarios.js';
import { scanRepo } from '../quality/scanner.js';
import { findRepoRoot } from '../utils/git.js';

export interface HealthOptions {
  json?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
  package?: string;
  all?: boolean;
  exclude?: string[];
}

export async function health(options: HealthOptions): Promise<void> {
  if (options.all) {
    if (options.json) {
      console.log(JSON.stringify({ error: 'Aggregate health check not yet implemented' }));
    } else {
      console.log(pc.yellow('Aggregate health check not yet implemented'));
    }
    process.exitCode = 1;
    return;
  }

  let repoRoot: string;
  try {
    repoRoot = await findRepoRoot();
  } catch {
    if (options.json) {
      console.log(JSON.stringify({ error: 'Not inside a git repository' }));
    } else {
      console.error(pc.red('Error: Not inside a git repository'));
    }
    process.exitCode = 1;
    return;
  }

  const scanRoot = options.package
    ? await resolvePackageRoot(repoRoot, options.package, options)
    : repoRoot;

  if (!scanRoot) {
    return;
  }

  const ctx = await scanRepo(scanRoot, { exclude: options.exclude });
  const tokenAnalysis = analyzeTokens(ctx);
  const scenarioResults = simulateScenarios(ctx);
  const fileRois = calculateRoi(ctx, scenarioResults);
  const healthScore = computeHealthScore(tokenAnalysis, scenarioResults, fileRois, ctx);

  const claudeMdTokens = tokenAnalysis.claudeMd?.tokens ?? 0;
  const progressiveDisclosure = tokenAnalysis.total > 0
    ? ((tokenAnalysis.total - claudeMdTokens) / tokenAnalysis.total) * 100
    : 0;

  const historyRoot = scanRoot;
  const history = await loadHistory(historyRoot);

  if (!options.dryRun) {
    await saveHistory(historyRoot, {
      timestamp: new Date().toISOString(),
      score: healthScore.overall,
      version: '0.1.0',
      tokenTotal: tokenAnalysis.total,
      fileCount: ctx.contextFiles.length,
    }, history);
  }

  const reportData: BenchmarkReportData = {
    repoName: basename(scanRoot),
    score: healthScore,
    tokenAnalysis,
    scenarioResults,
    fileRois,
    history,
    progressiveDisclosure,
  };

  if (options.json) {
    console.log(formatJsonBenchmarkReport(reportData));
  } else {
    console.log(formatHumanBenchmarkReport(reportData));
  }
}

async function resolvePackageRoot(
  repoRoot: string,
  packageName: string,
  options: HealthOptions,
): Promise<string | null> {
  const candidates = [
    join(repoRoot, 'apps', packageName),
    join(repoRoot, 'packages', packageName),
    join(repoRoot, packageName),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Not found at this location
    }
  }

  if (options.json) {
    console.log(JSON.stringify({ error: `Package "${packageName}" not found` }));
  } else {
    console.error(pc.red(`Error: Package "${packageName}" not found`));
  }
  process.exitCode = 1;
  return null;
}
