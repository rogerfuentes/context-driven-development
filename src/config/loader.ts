import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parse as parseYaml } from 'yaml';

import type { CddConfig } from '../quality/rules/types.js';

export const DEFAULT_CONFIG: CddConfig = {
  contextDir: '.claude/context',
  budgets: {
    claudeMd: 3000,
    perFile: 2000,
    perFileMin: 200,
    perLevel3File: 500,
    total: 0, // 0 = disabled (progressive disclosure makes total budget irrelevant)
  },
  thresholds: {
    jaccardDuplication: 0.4,
    maxAnnotations: 5,
    codeToProseRatio: 0.3,
  },
  rules: {},
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge<T>(
  base: T & object,
  override: Record<string, unknown>,
): T {
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };

  for (const key of Object.keys(override)) {
    const overrideVal = override[key];

    // Skip null/undefined — don't let YAML nulls wipe out default branches
    if (overrideVal == null) continue;

    const baseVal = result[key];
    result[key] =
      isPlainObject(baseVal) && isPlainObject(overrideVal)
        ? deepMerge(baseVal, overrideVal)
        : overrideVal;
  }

  return result as T;
}

export async function loadConfig(repoRoot: string): Promise<CddConfig> {
  const configPath = join(repoRoot, '.cdd', 'config.yaml');

  try {
    const raw = await readFile(configPath, 'utf-8');
    const parsed = parseYaml(raw) as { cdd?: Record<string, unknown> } | null;
    return deepMerge(DEFAULT_CONFIG, parsed?.cdd ?? {});
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}
