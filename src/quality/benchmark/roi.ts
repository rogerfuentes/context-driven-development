import type { RuleContext } from '../rules/types.js';
import type { ScenarioResult } from './scenarios.js';

export interface FileRoi {
  file: string;
  tokens: number;
  timesLoaded: number;
  totalScenarios: number;
  roi: number;
}

export function calculateRoi(
  ctx: RuleContext,
  scenarioResults: ScenarioResult[],
): FileRoi[] {
  const totalScenarios = scenarioResults.length;
  const rois: FileRoi[] = [];

  // Build load count map
  const loadCounts = new Map<string, number>();
  for (const result of scenarioResults) {
    for (const file of result.filesLoaded) {
      loadCounts.set(file, (loadCounts.get(file) ?? 0) + 1);
    }
  }

  // Calculate ROI for each context file (excluding CLAUDE.md which always loads)
  for (const cf of ctx.contextFiles) {
    const timesLoaded = loadCounts.get(cf.path) ?? 0;
    const loadFrequency = totalScenarios > 0 ? timesLoaded / totalScenarios : 0;
    // ROI = (loadFrequency * 100) / tokens * 1000
    // Higher means better value per token
    const roi = cf.tokens > 0
      ? (loadFrequency * 100) / cf.tokens * 1000
      : 0;

    rois.push({
      file: cf.path,
      tokens: cf.tokens,
      timesLoaded,
      totalScenarios,
      roi: Math.round(roi * 100) / 100,
    });
  }

  // Sort by ROI descending
  rois.sort((a, b) => b.roi - a.roi);

  return rois;
}
