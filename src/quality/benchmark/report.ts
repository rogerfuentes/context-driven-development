import pc from 'picocolors';

import { getScoreColor } from '../format-utils.js';
import type { TokenAnalysis } from './analyzer.js';
import type { HealthScore } from './health-score.js';
import type { BenchmarkEntry } from './history.js';
import type { FileRoi } from './roi.js';
import type { ScenarioResult } from './scenarios.js';

export interface BenchmarkReportData {
  repoName: string;
  score: HealthScore;
  tokenAnalysis: TokenAnalysis;
  scenarioResults: ScenarioResult[];
  fileRois: FileRoi[];
  history: BenchmarkEntry[];
  progressiveDisclosure: number;
}

function trendText(history: BenchmarkEntry[], current: number): string {
  if (history.length === 0) return 'No previous benchmarks';
  const prev = history[history.length - 1];
  const delta = current - prev.score;
  if (delta > 0) return pc.green(`+${delta} from last benchmark (${prev.score} -> ${current})`);
  if (delta < 0) return pc.red(`${delta} from last benchmark (${prev.score} -> ${current})`);
  return pc.dim(`No change from last benchmark (${current})`);
}

export function formatHumanBenchmarkReport(data: BenchmarkReportData): string {
  const { repoName, score, tokenAnalysis, scenarioResults, fileRois, history, progressiveDisclosure } = data;
  const lines: string[] = [];

  // Header
  lines.push(`CDD Health Report -- ${repoName}`);
  lines.push('='.repeat(40));
  lines.push('');

  // Health Score
  const scoreColor = getScoreColor(score.overall);
  lines.push(`Health Score: ${scoreColor(`${score.overall}/100`)}`);
  lines.push(`  Token efficiency:       ${score.breakdown.tokenEfficiency}/30`);
  lines.push(`  Progressive disclosure: ${score.breakdown.progressiveDisclosure}/30`);
  lines.push(`  File coverage:          ${score.breakdown.fileCoverage}/20`);
  lines.push(`  ROI distribution:       ${score.breakdown.roiDistribution}/20`);
  lines.push('');

  // Token Distribution
  lines.push('Token Distribution:');
  if (tokenAnalysis.claudeMd) {
    lines.push(`  CLAUDE.md:${' '.repeat(Math.max(1, 24 - 'CLAUDE.md:'.length))}${tokenAnalysis.claudeMd.tokens.toLocaleString().padStart(8)} (${tokenAnalysis.claudeMd.percentage.toFixed(1)}%)`);
  }
  for (const [path, info] of Object.entries(tokenAnalysis.files)) {
    const label = `${path}:`;
    const pad = Math.max(1, 24 - label.length);
    lines.push(`  ${label}${' '.repeat(pad)}${info.tokens.toLocaleString().padStart(8)} (${info.percentage.toFixed(1)}%)`);
  }
  lines.push(`  ${'Total:'.padEnd(24)}${tokenAnalysis.total.toLocaleString().padStart(8)}`);
  lines.push('');

  // Scenario Matrix
  lines.push('Scenario Matrix:');
  for (const result of scenarioResults) {
    const contextFiles = result.filesLoaded.filter((f) => f !== 'CLAUDE.md');
    const fileList = contextFiles.length > 0 ? contextFiles.join(', ') : pc.dim('(CLAUDE.md only)');
    lines.push(`  ${result.name.padEnd(20)}-> ${fileList}`);
  }
  lines.push('');

  // File ROI
  lines.push('File ROI:');
  for (const roi of fileRois) {
    const label = `${roi.file}:`;
    const pad = Math.max(1, 26 - label.length);
    lines.push(`  ${label}${' '.repeat(pad)}ROI ${roi.roi.toFixed(2)} (loaded ${roi.timesLoaded}/${roi.totalScenarios} scenarios)`);
  }
  lines.push('');

  // Dead / Overloaded files
  const deadFiles = fileRois.filter((r) => r.timesLoaded === 0);
  const overloadedFiles = fileRois.filter(
    (r) => r.timesLoaded === r.totalScenarios && r.totalScenarios > 1,
  );

  lines.push(`Dead files (never loaded): ${deadFiles.length === 0 ? pc.green('none') : pc.yellow(deadFiles.map((f) => f.file).join(', '))}`);
  lines.push(`Overloaded files (always loaded): ${overloadedFiles.length === 0 ? pc.green('none') : pc.yellow(overloadedFiles.map((f) => f.file).join(', '))}`);
  lines.push('');

  // Progressive Disclosure
  lines.push(`Progressive Disclosure: ${progressiveDisclosure.toFixed(1)}% deferred`);
  lines.push('');

  // Trend
  lines.push(`Trend: ${trendText(history, score.overall)}`);

  return lines.join('\n');
}

export interface BenchmarkJsonOutput {
  repo: string;
  score: number;
  version: string;
  timestamp: string;
  breakdown: HealthScore['breakdown'];
  tokenDistribution: TokenAnalysis;
  scenarios: ScenarioResult[];
  fileRoi: FileRoi[];
  deadFiles: string[];
  overloadedFiles: string[];
  progressiveDisclosure: number;
  trend: { previous: number | null; current: number; delta: number | null };
}

export function formatJsonBenchmarkReport(data: BenchmarkReportData): string {
  const { repoName, score, tokenAnalysis, scenarioResults, fileRois, history, progressiveDisclosure } = data;

  const deadFiles = fileRois.filter((r) => r.timesLoaded === 0).map((r) => r.file);
  const overloadedFiles = fileRois
    .filter((r) => r.timesLoaded === r.totalScenarios && r.totalScenarios > 1)
    .map((r) => r.file);

  const prev = history.length > 0 ? history[history.length - 1] : null;

  const output: BenchmarkJsonOutput = {
    repo: repoName,
    score: score.overall,
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    breakdown: score.breakdown,
    tokenDistribution: tokenAnalysis,
    scenarios: scenarioResults,
    fileRoi: fileRois,
    deadFiles,
    overloadedFiles,
    progressiveDisclosure,
    trend: {
      previous: prev?.score ?? null,
      current: score.overall,
      delta: prev ? score.overall - prev.score : null,
    },
  };

  return JSON.stringify(output, null, 2);
}
