import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pc from 'picocolors';

import { findRepoRoot } from '../utils/git.js';
import { fileExists } from '../utils/fs.js';
import { parseParallelAnalysis } from './plan-parser.js';
import { formatHumanConflictReport, formatJsonConflictReport } from './conflict-report.js';
import type { ConflictResult, FileConflict } from './conflict-report.js';

export interface ConflictDetectOptions {
  json?: boolean;
  verbose?: boolean;
  specsDir?: string;
}

export async function conflictDetect(specId: string, options: ConflictDetectOptions): Promise<void> {
  let repoRoot: string;
  try {
    repoRoot = await findRepoRoot();
  } catch {
    if (options.json) {
      console.log(JSON.stringify({ status: 'error', command: 'conflict-detect', error: 'Not inside a git repository' }));
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
      console.log(JSON.stringify({ status: 'error', command: 'conflict-detect', error: `Spec not found: ${specId}` }));
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
      console.log(JSON.stringify({ status: 'not-parallelizable', command: 'conflict-detect', specId }));
    } else {
      console.log(`${pc.yellow('Not parallelizable:')} Spec ${specId} does not support parallel execution.`);
    }
    return;
  }

  // Build file → streams map
  const fileToStreams = new Map<string, string[]>();
  for (const stream of analysis.streams) {
    for (const file of stream.files) {
      const existing = fileToStreams.get(file) ?? [];
      existing.push(stream.name);
      fileToStreams.set(file, existing);
    }
  }

  // Find conflicts (files in 2+ streams)
  const conflicts: FileConflict[] = [];
  const safeFiles: Array<{ filePath: string; stream: string }> = [];

  for (const [filePath, streams] of fileToStreams) {
    if (streams.length > 1) {
      conflicts.push({ filePath, streams });
    } else {
      safeFiles.push({ filePath, stream: streams[0] });
    }
  }

  const result: ConflictResult = {
    specId,
    conflicts,
    safeFiles,
    hasConflicts: conflicts.length > 0,
  };

  if (options.json) {
    console.log(formatJsonConflictReport(result));
  } else {
    console.log(formatHumanConflictReport(result));
  }
}
