import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import pc from 'picocolors';
import yoctoSpinner from 'yocto-spinner';

import { renderPrompt } from '../claude/prompt-loader.js';
import { PROMPTS } from '../claude/prompts.js';
import { checkClaudeInstalled, ClaudeRunnerError, run } from '../claude/runner.js';
import { loadConfig } from '../config/loader.js';
import { estimateTokens } from '../quality/token-counter.js';
import { scanRepo } from '../quality/scanner.js';
import { confirm } from '../utils/confirm.js';
import { safePath } from '../utils/fs.js';
import { findRepoRoot } from '../utils/git.js';
import { parseLearnResponse } from './learn-parser.js';
import { gatherSource } from './learn-source.js';

const READ_ONLY_TOOLS = ['Read', 'Grep', 'Glob', 'Bash(git log:*)', 'Bash(git diff:*)'];

export interface LearnOptions {
  json?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
  merge?: string;
  session?: string;
  file?: string;
  url?: string;
  prompt?: string;
  yes?: boolean;
}

export async function learn(options: LearnOptions): Promise<void> {
  let repoRoot: string;
  try {
    repoRoot = await findRepoRoot();
  } catch {
    if (options.json) {
      console.log(JSON.stringify({ status: 'error', message: 'Not inside a git repository' }));
    } else {
      console.error(pc.red('Error: Not inside a git repository'));
    }
    process.exitCode = 1;
    return;
  }

  await loadConfig(repoRoot);

  let sourceResult;
  try {
    sourceResult = await gatherSource(options, repoRoot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to gather source';
    if (options.json) {
      console.log(JSON.stringify({ status: 'error', message: msg }));
    } else {
      console.error(pc.red(`Error: ${msg}`));
    }
    process.exitCode = 1;
    return;
  }

  if (!options.json) {
    console.log(pc.dim(`Source: ${sourceResult.label}`));
  }

  const existingContext = await scanRepo(repoRoot);
  const existingInfo = buildExistingContextInfo(existingContext);

  const mergeInstruction = options.merge
    ? `\n\nMUST merge the extracted knowledge into the existing file: ${options.merge}. Do not create a new file.`
    : '';

  const prompt = renderPrompt(PROMPTS.learn, {
    cwd: repoRoot,
    source: sourceResult.content,
  }) + existingInfo + mergeInstruction;

  if (options.dryRun) {
    if (options.json) {
      console.log(JSON.stringify({ status: 'dry_run', prompt, sourceLength: sourceResult.content.length }));
    } else {
      console.log(pc.dim('--- Source content gathered ---'));
      console.log(pc.dim(`Length: ${sourceResult.content.length} chars`));
      console.log(pc.dim('--- Prompt that would be sent to Claude ---'));
      console.log(prompt.slice(0, 2000) + (prompt.length > 2000 ? '\n...(truncated)' : ''));
      console.log(pc.dim('--- End prompt ---'));
    }
    return;
  }

  const installed = await checkClaudeInstalled();
  if (!installed) {
    if (options.json) {
      console.log(JSON.stringify({ status: 'error', message: 'Claude CLI not found' }));
    } else {
      console.error(pc.red('Error: Claude CLI not found. Install from https://claude.ai/code'));
    }
    process.exitCode = 3;
    return;
  }

  const spinner = yoctoSpinner({ text: 'Extracting knowledge with Claude...' }).start();

  try {
    const result = await run({
      prompt,
      cwd: repoRoot,
      verbose: options.verbose,
      timeout: 300_000,
      allowedTools: READ_ONLY_TOOLS,
      permissionMode: 'default',
    });

    const learnResult = parseLearnResponse(result.output);

    spinner.success('Knowledge extracted');

    if (!learnResult.content || !learnResult.targetFile) {
      if (options.json) {
        console.log(JSON.stringify({ status: 'completed', duration: result.duration, filesWritten: 0, ...(learnResult.reason ? { reason: learnResult.reason } : {}) }));
      } else {
        console.log(pc.yellow(learnResult.reason ?? 'No content to write.'));
      }
      return;
    }

    // Show plan
    if (!options.json) {
      console.log('');
      const actionLabel = learnResult.action === 'create' ? pc.green('Create') : pc.yellow('Merge into');
      const tokens = estimateTokens(learnResult.content);
      console.log(`${actionLabel} ${pc.bold(learnResult.targetFile)} (${tokens} tokens)`);

      if (learnResult.overlap.length > 0) {
        console.log('');
        console.log(pc.dim('Overlap detected with:'));
        for (const o of learnResult.overlap) {
          console.log(pc.dim(`  ${o.file} (${(o.similarity * 100).toFixed(0)}% similar)`));
        }
      }

      if (learnResult.claudeMdUpdate) {
        console.log(pc.cyan('CLAUDE.md will be updated with new reference'));
      }
      console.log('');
    }

    // Confirm before writing
    if (!options.yes && !options.json) {
      const confirmed = await confirm('Write these files?');
      if (!confirmed) {
        console.log(pc.dim('Aborted.'));
        return;
      }
    }

    // Write files
    let filePath: string;
    try {
      filePath = safePath(repoRoot, learnResult.targetFile);
    } catch (pathError) {
      const msg = pathError instanceof Error ? pathError.message : 'Invalid target file path';
      if (options.json) {
        console.log(JSON.stringify({ status: 'error', message: msg }));
      } else {
        console.error(pc.red(`Error: ${msg}`));
      }
      process.exitCode = 1;
      return;
    }

    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, learnResult.content, 'utf-8');
    } catch (writeError) {
      const msg = writeError instanceof Error ? writeError.message : 'Failed to write file';
      if (options.json) {
        console.log(JSON.stringify({ status: 'error', message: msg }));
      } else {
        console.error(pc.red(`Error: ${msg}`));
      }
      process.exitCode = 1;
      return;
    }

    if (learnResult.claudeMdUpdate) {
      try {
        const claudeMdPath = join(repoRoot, 'CLAUDE.md');
        const existing = await readFile(claudeMdPath, 'utf-8').catch(() => '');
        const update = learnResult.claudeMdUpdate;

        // If the update looks like a full CLAUDE.md (has a heading), replace entirely.
        // Otherwise it's a partial snippet (e.g., a table row) — append to the existing content.
        if (update.startsWith('#') || update.startsWith('IMPORTANT') || update.includes('\n## ')) {
          await writeFile(claudeMdPath, update, 'utf-8');
        } else {
          // Partial snippet (e.g., table row) — append to existing or create new
          const base = existing ? existing.trimEnd() + '\n' : '';
          await writeFile(claudeMdPath, base + update + '\n', 'utf-8');
        }
      } catch (writeError) {
        const msg = writeError instanceof Error ? writeError.message : 'Failed to update CLAUDE.md';
        if (options.json) {
          console.log(JSON.stringify({ status: 'error', message: msg }));
        } else {
          console.error(pc.red(`Error: ${msg}`));
        }
        process.exitCode = 1;
        return;
      }
    }

    if (options.json) {
      console.log(JSON.stringify({
        status: 'completed',
        duration: result.duration,
        ...learnResult,
      }));
    } else {
      const actionLabel = learnResult.action === 'create' ? pc.green('Created') : pc.yellow('Merged into');
      console.log(`${actionLabel} ${pc.bold(learnResult.targetFile)}`);
      console.log(pc.dim(`Duration: ${(result.duration / 1000).toFixed(1)}s`));
      console.log('');
      console.log(`Run ${pc.cyan('cdd curate')} to validate the new context.`);
    }
  } catch (error) {
    spinner.error('Learn failed');

    const message = error instanceof Error ? error.message : 'Unknown error';
    const exitCode = error instanceof ClaudeRunnerError ? error.exitCode : 1;

    if (options.json) {
      console.log(JSON.stringify({ status: 'error', message, exitCode }));
    } else {
      console.error(pc.red(`Error: ${message}`));
      if (error instanceof ClaudeRunnerError && error.stderr) {
        console.error(pc.dim(error.stderr));
      }
    }
    process.exitCode = exitCode;
  }
}

function buildExistingContextInfo(ctx: Awaited<ReturnType<typeof scanRepo>>): string {
  if (ctx.contextFiles.length === 0) {
    return '';
  }

  let info = '\n\nExisting context files in this repo:\n';
  for (const f of ctx.contextFiles) {
    info += `\n--- ${f.path} (${f.tokens} tokens) ---\n`;
    if (f.frontmatter) {
      info += `name: ${f.frontmatter.name || 'N/A'}\n`;
      info += `description: ${f.frontmatter.description || 'N/A'}\n`;
    }
    info += f.content.slice(0, 500) + '\n';
  }
  return info;
}
