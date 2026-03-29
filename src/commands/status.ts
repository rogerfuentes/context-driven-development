import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import pc from 'picocolors';

import { findRepoRoot } from '../utils/git.js';
import { fileExists } from '../utils/fs.js';
import { parsePlanCheckboxes } from './status-parser.js';
import { formatHumanStatusReport, formatJsonStatusReport } from './status-report.js';
import type { SpecStatus, StatusResult } from './status-report.js';

export interface StatusOptions {
  json?: boolean;
  verbose?: boolean;
  specsDir?: string;
}

async function scanSpecsDir(dir: string, permanent: boolean): Promise<SpecStatus[]> {
  const specs: SpecStatus[] = [];

  if (!(await fileExists(dir))) return specs;

  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const specDir = join(dir, entry.name);
    const planPath = join(specDir, 'plan.md');
    const analysisPath = join(specDir, 'analysis.md');
    const summaryPath = join(specDir, 'summary.md');

    const hasPlan = await fileExists(planPath);
    const hasAnalysis = await fileExists(analysisPath);
    const hasSummary = await fileExists(summaryPath);

    if (!hasPlan && !hasAnalysis) continue; // not a real spec

    let totalSteps = 0;
    let completedSteps = 0;
    let lastModified = new Date(0);

    if (hasPlan) {
      const content = await readFile(planPath, 'utf-8');
      const checkboxes = parsePlanCheckboxes(content);
      totalSteps = checkboxes.total;
      completedSteps = checkboxes.completed;
      const planStat = await stat(planPath);
      lastModified = planStat.mtime;
    }

    specs.push({
      id: entry.name,
      path: dir,
      hasAnalysis,
      hasPlan,
      hasSummary,
      totalSteps,
      completedSteps,
      permanent,
      lastModified,
    });
  }

  return specs;
}

export async function status(options: StatusOptions): Promise<void> {
  let repoRoot: string;
  try {
    repoRoot = await findRepoRoot();
  } catch {
    if (options.json) {
      console.log(JSON.stringify({ status: 'error', command: 'status', error: 'Not inside a git repository' }));
    } else {
      console.error(pc.red('Error: Not inside a git repository'));
    }
    process.exitCode = 1;
    return;
  }

  const repoName = basename(repoRoot);

  // Scan default specs dir
  const defaultDir = join(repoRoot, '.claude', 'specs');
  const allSpecs: SpecStatus[] = [];

  allSpecs.push(...await scanSpecsDir(defaultDir, false));

  // Scan custom specs dir if provided
  if (options.specsDir) {
    const customDir = join(repoRoot, options.specsDir);
    allSpecs.push(...await scanSpecsDir(customDir, true));
  }

  // Also check CLAUDE.md for active specs with custom paths
  // (look for spec table entries that reference non-default paths)
  const claudeMdPath = join(repoRoot, 'CLAUDE.md');
  if (await fileExists(claudeMdPath)) {
    const claudeMd = await readFile(claudeMdPath, 'utf-8');
    // Parse "Active Specs" table for paths
    const specPathRegex = /\|\s*\[?([^\]|]+)\]?\s*\|\s*([^\s|]+)/g;
    let match;
    while ((match = specPathRegex.exec(claudeMd)) !== null) {
      const potentialPath = match[2].trim();
      if (potentialPath.includes('/') && !potentialPath.startsWith('.claude/specs')) {
        const absPath = join(repoRoot, potentialPath);
        if (await fileExists(absPath)) {
          // Check if we already scanned this dir
          const existing = allSpecs.find(s => s.path === absPath);
          if (!existing) {
            allSpecs.push(...await scanSpecsDir(absPath, true));
          }
        }
      }
    }
  }

  const totalSteps = allSpecs.reduce((sum, s) => sum + s.totalSteps, 0);
  const completedSteps = allSpecs.reduce((sum, s) => sum + s.completedSteps, 0);

  const result: StatusResult = {
    repoName,
    specs: allSpecs,
    overall: {
      total: totalSteps,
      completed: completedSteps,
      percentage: totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0,
    },
  };

  if (options.json) {
    console.log(formatJsonStatusReport(result));
  } else {
    console.log(formatHumanStatusReport(result));
  }
}
