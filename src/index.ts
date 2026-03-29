// Quality rules
export { checkStructure, checkStructureAsync } from './quality/rules/structure.js';
export { checkEfficiency } from './quality/rules/efficiency.js';
export { checkClarity } from './quality/rules/clarity.js';
export { checkAnnotations } from './quality/rules/annotations.js';

// Scoring
export { computeScore, computeCompleteness, computeCleanliness } from './quality/scorer.js';

// Scanner
export { scanRepo } from './quality/scanner.js';
export type { ScanOptions } from './quality/scanner.js';

// Token analysis
export { estimateTokens } from './quality/token-counter.js';

// Benchmark
export { analyzeTokens } from './quality/benchmark/analyzer.js';
export { simulateScenarios } from './quality/benchmark/scenarios.js';
export { calculateRoi } from './quality/benchmark/roi.js';
export { computeHealthScore } from './quality/benchmark/health-score.js';
export { loadHistory, saveHistory } from './quality/benchmark/history.js';

// Config
export { loadConfig } from './config/loader.js';

// Types
export type { Finding, RuleContext, CddConfig, ContextFile, Frontmatter, Severity, RuleFn } from './quality/rules/types.js';
export type { TokenAnalysis } from './quality/benchmark/analyzer.js';
export type { HealthScore } from './quality/benchmark/health-score.js';
export type { Scenario, ScenarioResult } from './quality/benchmark/scenarios.js';
export type { FileRoi } from './quality/benchmark/roi.js';
export type { BenchmarkEntry } from './quality/benchmark/history.js';
