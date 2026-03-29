import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ensureDir } from '../../utils/fs.js';

export interface BenchmarkEntry {
  timestamp: string;
  score: number;
  version: string;
  tokenTotal: number;
  fileCount: number;
}

export async function loadHistory(repoRoot: string): Promise<BenchmarkEntry[]> {
  const historyPath = join(repoRoot, '.cdd', 'health-history.json');
  try {
    const raw = await readFile(historyPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as BenchmarkEntry[];
    }
    return [];
  } catch {
    return [];
  }
}

export async function saveHistory(
  repoRoot: string,
  entry: BenchmarkEntry,
  history: BenchmarkEntry[],
): Promise<void> {
  const cddDir = join(repoRoot, '.cdd');
  await ensureDir(cddDir);

  const updated = [...history, entry];
  const historyPath = join(cddDir, 'health-history.json');
  await writeFile(historyPath, JSON.stringify(updated, null, 2) + '\n', 'utf-8');
}
