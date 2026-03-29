import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pc from 'picocolors';

import { findRepoRoot } from '../utils/git.js';
import { fileExists } from '../utils/fs.js';
import { parseParallelAnalysis } from './plan-parser.js';
import type { ParallelStream } from './plan-parser.js';
import { formatHumanWavePlan, formatJsonWavePlan } from './wave-plan-report.js';
import type { WavePlan } from './wave-plan-report.js';

export interface WavePlanOptions {
  json?: boolean;
  verbose?: boolean;
  specsDir?: string;
}

/**
 * Topological sort streams into waves using Kahn's algorithm.
 * Streams with no unresolved deps go in the current wave.
 * Returns null if a cycle is detected.
 */
function topoSortWaves(
  streams: ParallelStream[],
): Array<{ waveNumber: number; streams: ParallelStream[] }> | null {
  const nameToStream = new Map(streams.map((s) => [s.name, s]));
  const resolved = new Set<string>();
  const remaining = new Set(streams.map((s) => s.name));
  const waves: Array<{ waveNumber: number; streams: ParallelStream[] }> = [];
  let waveNumber = 1;

  while (remaining.size > 0) {
    const ready: ParallelStream[] = [];
    for (const name of remaining) {
      const stream = nameToStream.get(name)!;
      const allDepsResolved = stream.dependencies.every(
        (d) => resolved.has(d) || !remaining.has(d),
      );
      if (allDepsResolved) {
        ready.push(stream);
      }
    }

    if (ready.length === 0) {
      // Cycle detected — no streams can be resolved
      return null;
    }

    waves.push({ waveNumber, streams: ready });
    for (const s of ready) {
      resolved.add(s.name);
      remaining.delete(s.name);
    }
    waveNumber++;
  }

  return waves;
}

export async function wavePlan(specId: string, options: WavePlanOptions): Promise<void> {
  let repoRoot: string;
  try {
    repoRoot = await findRepoRoot();
  } catch {
    if (options.json) {
      console.log(
        JSON.stringify({
          status: 'error',
          command: 'wave-plan',
          error: 'Not inside a git repository',
        }),
      );
    } else {
      console.error(pc.red('Error: Not inside a git repository'));
    }
    process.exitCode = 1;
    return;
  }

  // Resolve plan.md path
  const specsBase = options.specsDir
    ? join(repoRoot, options.specsDir)
    : join(repoRoot, '.claude', 'specs');
  const planPath = join(specsBase, specId, 'plan.md');

  if (!(await fileExists(planPath))) {
    if (options.json) {
      console.log(
        JSON.stringify({
          status: 'error',
          command: 'wave-plan',
          error: `Spec not found: ${specId}`,
        }),
      );
    } else {
      console.error(pc.red(`Error: Spec not found: ${planPath}`));
    }
    process.exitCode = 1;
    return;
  }

  const content = await readFile(planPath, 'utf-8');
  const analysis = parseParallelAnalysis(content);

  if (!analysis.canParallelize) {
    if (options.json) {
      console.log(JSON.stringify({ status: 'not-parallelizable', command: 'wave-plan', specId }));
    } else {
      console.log(
        `${pc.yellow('Not parallelizable:')} Spec ${specId} does not support parallel execution.`,
      );
    }
    return;
  }

  // Topological sort
  const waves = topoSortWaves(analysis.streams);
  if (waves === null) {
    if (options.json) {
      console.log(
        JSON.stringify({
          status: 'error',
          command: 'wave-plan',
          error: 'Cycle detected in stream dependencies',
        }),
      );
    } else {
      console.error(
        pc.red('Error: Cycle detected in stream dependencies. Cannot create wave plan.'),
      );
    }
    process.exitCode = 1;
    return;
  }

  const plan: WavePlan = {
    specId,
    phase0: { sharedContracts: analysis.sharedContracts },
    waves,
  };

  if (options.json) {
    console.log(formatJsonWavePlan(plan));
  } else {
    console.log(formatHumanWavePlan(plan));
  }
}
