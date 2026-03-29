import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadHistory, saveHistory } from '../../../src/quality/benchmark/history.js';
import type { BenchmarkEntry } from '../../../src/quality/benchmark/history.js';

const TMP_DIR = join(process.cwd(), '__tests__', '.tmp-history');

describe('benchmark history', () => {
  beforeEach(async () => {
    await mkdir(join(TMP_DIR, '.git'), { recursive: true });
  });

  afterEach(async () => {
    await rm(TMP_DIR, { recursive: true, force: true });
  });

  it('returns empty array when no history file exists', async () => {
    const history = await loadHistory(TMP_DIR);
    expect(history).toEqual([]);
  });

  it('creates history file when saving first entry', async () => {
    const entry: BenchmarkEntry = {
      timestamp: '2026-01-01T00:00:00.000Z',
      score: 75,
      version: '0.1.0',
      tokenTotal: 5000,
      fileCount: 3,
    };

    await saveHistory(TMP_DIR, entry, []);

    const historyPath = join(TMP_DIR, '.cdd', 'health-history.json');
    const raw = await readFile(historyPath, 'utf-8');
    const parsed = JSON.parse(raw);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].score).toBe(75);
  });

  it('appends to existing history', async () => {
    const existing: BenchmarkEntry[] = [
      {
        timestamp: '2026-01-01T00:00:00.000Z',
        score: 70,
        version: '0.1.0',
        tokenTotal: 4000,
        fileCount: 2,
      },
    ];

    await saveHistory(TMP_DIR, existing[0], []);

    const newEntry: BenchmarkEntry = {
      timestamp: '2026-02-01T00:00:00.000Z',
      score: 80,
      version: '0.1.0',
      tokenTotal: 5000,
      fileCount: 3,
    };

    const loaded = await loadHistory(TMP_DIR);
    await saveHistory(TMP_DIR, newEntry, loaded);

    const history = await loadHistory(TMP_DIR);
    expect(history).toHaveLength(2);
    expect(history[0].score).toBe(70);
    expect(history[1].score).toBe(80);
  });

  it('loads history correctly', async () => {
    const entries: BenchmarkEntry[] = [
      { timestamp: '2026-01-01T00:00:00.000Z', score: 60, version: '0.1.0', tokenTotal: 3000, fileCount: 1 },
      { timestamp: '2026-02-01T00:00:00.000Z', score: 70, version: '0.1.0', tokenTotal: 4000, fileCount: 2 },
      { timestamp: '2026-03-01T00:00:00.000Z', score: 80, version: '0.1.0', tokenTotal: 5000, fileCount: 3 },
    ];

    // Save entries one by one
    let history: BenchmarkEntry[] = [];
    for (const entry of entries) {
      await saveHistory(TMP_DIR, entry, history);
      history = await loadHistory(TMP_DIR);
    }

    expect(history).toHaveLength(3);
    expect(history.map((e) => e.score)).toEqual([60, 70, 80]);
  });
});
