import { basename } from 'node:path';

import pc from 'picocolors';
import yoctoSpinner from 'yocto-spinner';

import { renderPrompt } from '../claude/prompt-loader.js';
import { PROMPTS } from '../claude/prompts.js';
import { checkClaudeInstalled, ClaudeRunnerError, run } from '../claude/runner.js';
import { formatHumanReport, formatJsonReport } from '../quality/report.js';
import { checkAnnotations } from '../quality/rules/annotations.js';
import { checkClarity } from '../quality/rules/clarity.js';
import { checkEfficiency } from '../quality/rules/efficiency.js';
import { checkStructureAsync } from '../quality/rules/structure.js';
import type { Finding } from '../quality/rules/types.js';
import { scanRepo } from '../quality/scanner.js';
import { computeScore } from '../quality/scorer.js';
import { findRepoRoot } from '../utils/git.js';
import { parseCurateFullResponse } from './curate-parser.js';

export interface CurateOptions {
  json?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
  full?: boolean;
  exclude?: string[];
}

export async function curate(options: CurateOptions): Promise<void> {
  let repoRoot: string;
  try {
    repoRoot = await findRepoRoot();
  } catch {
    if (options.json) {
      console.log(JSON.stringify({ error: 'Not inside a git repository' }));
    } else {
      console.error(pc.red('Error: Not inside a git repository'));
    }
    process.exitCode = 1;
    return;
  }

  const ctx = await scanRepo(repoRoot, { exclude: options.exclude });

  const findings: Finding[] = [
    ...checkClarity(ctx),
    ...checkEfficiency(ctx),
    ...(await checkStructureAsync(ctx)),
    ...(await checkAnnotations(ctx)),
  ];

  if (options.full) {
    findings.push(...(await runSemanticChecks(repoRoot, ctx, options)));
  }

  const score = computeScore(findings, ctx);
  const repoName = basename(repoRoot);
  const reportData = { repoName, score, findings, ctx };

  if (options.json) {
    console.log(formatJsonReport(reportData));
  } else {
    console.log(formatHumanReport(reportData));
  }

  if (findings.some((f) => f.severity === 'error')) {
    process.exitCode = 2;
  }
}

async function runSemanticChecks(
  repoRoot: string,
  ctx: Awaited<ReturnType<typeof scanRepo>>,
  options: CurateOptions,
): Promise<Finding[]> {
  const installed = await checkClaudeInstalled();
  if (!installed) {
    if (!options.json) {
      console.log(
        pc.yellow('Claude CLI not found -- skipping semantic checks. Static results still apply.'),
      );
    }
    return [];
  }

  if (!ctx.claudeMdContent && ctx.contextFiles.length === 0) {
    return [];
  }

  let contextContent = '';
  if (ctx.claudeMdContent) {
    contextContent += `\n--- CLAUDE.md ---\n${ctx.claudeMdContent}\n`;
  }
  for (const f of ctx.contextFiles) {
    contextContent += `\n--- ${f.path} ---\n${f.content}\n`;
  }

  const prompt =
    renderPrompt(PROMPTS.curateFull, { cwd: repoRoot }) +
    '\n\n## Context Files to Analyze\n' +
    contextContent;

  if (options.dryRun) {
    if (options.json) {
      console.log(JSON.stringify({ semantic_prompt: prompt }));
    } else {
      console.log(pc.dim('--- Semantic check prompt ---'));
      console.log(prompt);
      console.log(pc.dim('--- End prompt ---'));
    }
    return [];
  }

  const spinner = yoctoSpinner({ text: 'Running semantic checks with Claude...' }).start();

  try {
    const result = await run({
      prompt,
      cwd: repoRoot,
      verbose: options.verbose,
      timeout: 300_000,
      allowedTools: ['Read', 'Grep', 'Glob'],
      permissionMode: 'default',
    });

    spinner.success('Semantic checks complete');
    return parseCurateFullResponse(result.output).findings;
  } catch (error) {
    spinner.error('Semantic checks failed');

    if (error instanceof ClaudeRunnerError && !options.json) {
      console.error(pc.yellow(`Warning: Semantic checks failed: ${error.message}`));
      console.log(pc.dim('Static check results are still valid.'));
    }

    return [];
  }
}
