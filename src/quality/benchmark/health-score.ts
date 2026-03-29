import type { RuleContext } from '../rules/types.js';
import type { TokenAnalysis } from './analyzer.js';
import type { ScenarioResult } from './scenarios.js';
import type { FileRoi } from './roi.js';

export interface HealthScore {
  overall: number;
  breakdown: {
    tokenEfficiency: number;
    progressiveDisclosure: number;
    fileCoverage: number;
    roiDistribution: number;
  };
}

// Each topic has aliases so files like "conventions.md" or "workflows.md" still match.
// TODO: Replace this hardcoded approach with dynamic coverage detection based on
// actual context file count and frontmatter quality — this list is fundamentally fragile.
const COVERAGE_TOPICS: string[][] = [
  ['architecture', 'arch', 'system-design', 'service-map', 'data-flow'],
  ['code-style', 'conventions', 'style-guide', 'coding-standard', 'code style'],
  ['testing', 'tests', 'test-pattern', 'jest', 'vitest'],
  ['dev-setup', 'workflows', 'development', 'local-dev', 'getting-started', 'dev setup', 'commands'],
];

function scoreTokenEfficiency(
  tokenAnalysis: TokenAnalysis,
  ctx: RuleContext,
): number {
  const usage = tokenAnalysis.budgetUsage;
  let score: number;

  if (usage > 100) {
    score = 0;
  } else if (usage <= 50) {
    score = 30;
  } else if (usage <= 75) {
    score = 20;
  } else {
    score = 10;
  }

  // Penalty if any single file exceeds per-file budget
  const perFileBudget = ctx.config.budgets.perFile;
  for (const cf of ctx.contextFiles) {
    if (cf.tokens > perFileBudget) {
      score = Math.max(0, score - 5);
      break;
    }
  }

  return score;
}

function scoreProgressiveDisclosure(tokenAnalysis: TokenAnalysis): number {
  if (tokenAnalysis.total === 0) return 0;

  const claudeMdTokens = tokenAnalysis.claudeMd?.tokens ?? 0;
  const deferredPercentage = ((tokenAnalysis.total - claudeMdTokens) / tokenAnalysis.total) * 100;

  if (deferredPercentage > 80) return 30;
  if (deferredPercentage > 60) return 20;
  if (deferredPercentage > 40) return 10;
  return 0;
}

function scoreFileCoverage(ctx: RuleContext): number {
  let points = 0;
  const activeFiles = ctx.contextFiles.filter((cf) => cf.referenced);

  for (const aliases of COVERAGE_TOPICS) {
    const covered = aliases.some((alias) => {
      const inClaudeMd = ctx.claudeMdContent?.toLowerCase().includes(alias) ?? false;
      if (inClaudeMd) return true;

      return activeFiles.some((cf) => {
        const pathLower = cf.path.toLowerCase();
        const nameLower = (cf.frontmatter?.name ?? '').toLowerCase();
        const descLower = (cf.frontmatter?.description ?? '').toLowerCase();
        const contentPreview = cf.content.slice(0, 500).toLowerCase();

        return (
          pathLower.includes(alias) ||
          nameLower.includes(alias) ||
          descLower.includes(alias) ||
          contentPreview.includes(alias)
        );
      });
    });

    if (covered) {
      points += 5;
    }
  }

  return Math.min(20, points);
}

function scoreRoiDistribution(
  fileRois: FileRoi[],
  scenarioResults: ScenarioResult[],
): number {
  const totalScenarios = scenarioResults.length;
  if (totalScenarios === 0 || fileRois.length === 0) return 20;

  let score = 20;

  // Only penalize overloaded files (loaded in ALL scenarios — should be in CLAUDE.md).
  // Dead files (never loaded) are NOT penalized here — orphan detection in
  // structure.ts already handles truly unreferenced files. The scenario simulator
  // uses generic keywords that can't match specialized domain files, so "dead"
  // in simulation != dead in practice.
  for (const roi of fileRois) {
    if (roi.timesLoaded === totalScenarios && totalScenarios > 1) {
      score -= 5;
    }
  }

  return Math.max(0, score);
}

export function computeHealthScore(
  tokenAnalysis: TokenAnalysis,
  scenarioResults: ScenarioResult[],
  fileRois: FileRoi[],
  ctx: RuleContext,
): HealthScore {
  const tokenEfficiency = scoreTokenEfficiency(tokenAnalysis, ctx);
  const progressiveDisclosure = scoreProgressiveDisclosure(tokenAnalysis);
  const fileCoverage = scoreFileCoverage(ctx);
  const roiDistribution = scoreRoiDistribution(fileRois, scenarioResults);

  const overall = Math.max(0, Math.min(100,
    tokenEfficiency + progressiveDisclosure + fileCoverage + roiDistribution,
  ));

  return {
    overall,
    breakdown: {
      tokenEfficiency,
      progressiveDisclosure,
      fileCoverage,
      roiDistribution,
    },
  };
}
