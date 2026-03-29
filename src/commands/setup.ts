import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import pc from 'picocolors';
import yoctoSpinner from 'yocto-spinner';

import { renderPrompt } from '../claude/prompt-loader.js';
import { PROMPTS } from '../claude/prompts.js';
import { checkClaudeInstalled, ClaudeRunnerError, runAgent } from '../claude/runner.js';
import { loadConfig } from '../config/loader.js';
import { estimateTokens } from '../quality/token-counter.js';
import { scanRepo } from '../quality/scanner.js';
import { confirm } from '../utils/confirm.js';
import { safePath } from '../utils/fs.js';
import { findRepoRoot } from '../utils/git.js';
import { scanLegacyDirs } from '../utils/migrator.js';
import { detectMonorepo, enumeratePackages } from '../utils/monorepo.js';
import { parseSetupResponse } from './setup-parser.js';

export interface SetupOptions {
  json?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
  force?: boolean;
  topics?: string;
  includeExisting?: boolean;
  yes?: boolean;
  all?: boolean;
  filter?: string;
  concurrency?: number;
}

export async function setup(options: SetupOptions): Promise<void> {
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

  if (options.all) {
    await setupAll(repoRoot, options);
    return;
  }

  // Agent SDK requires ANTHROPIC_API_KEY; Claude CLI must also be installed (SDK spawns it)
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- runtime requirement, not build dependency
  if (!process.env.ANTHROPIC_API_KEY) {
    const message = 'ANTHROPIC_API_KEY is required. Set it in your environment.';
    if (options.json) {
      console.log(JSON.stringify({ status: 'error', message }));
    } else {
      console.error(pc.red(`Error: ${message}`));
    }
    process.exitCode = 3;
    return;
  }

  const installed = await checkClaudeInstalled();
  if (!installed) {
    const message = 'Claude CLI not found. Install from https://claude.ai/code';
    if (options.json) {
      console.log(JSON.stringify({ status: 'error', message }));
    } else {
      console.error(pc.red(`Error: ${message}`));
    }
    process.exitCode = 3;
    return;
  }

  const result = await setupRoot(repoRoot, options);
  if (result.status === 'error') {
    if (options.json) {
      console.log(JSON.stringify(result));
    }
    process.exitCode = 1;
    return;
  }
  if (options.json) {
    console.log(JSON.stringify(result));
  } else if (result.status === 'completed' && result.filesWritten > 0) {
    console.log('');
    console.log(`Run ${pc.cyan('cdd curate')} to validate the generated context.`);
  }
}

// ---------------------------------------------------------------------------
// Root-level setup: scans repo root, migrates legacy files, generates context
// ---------------------------------------------------------------------------

interface SetupRootResult {
  status: 'completed' | 'skipped' | 'error';
  filesWritten: number;
  legacyFilesFound: number;
  duration?: number;
  message?: string;
  projectType?: string;
  topics?: string[];
}

async function setupRoot(repoRoot: string, options: SetupOptions): Promise<SetupRootResult> {
  const existingContext = await scanRepo(repoRoot);

  // -- Legacy files: directories referenced from CLAUDE.md + well-known locations --
  const legacyFiles = await scanLegacyDirs(repoRoot, existingContext.claudeMdContent, existingContext.contextDir);
  let legacyInfo = '';

  if (legacyFiles.length > 0) {
    if (!options.json) {
      console.log(pc.bold(`Found ${legacyFiles.length} reference file(s) to migrate:`));
      for (const f of legacyFiles) {
        const overBudget = f.tokens > 1500 ? pc.yellow(` (${f.tokens}t — will compress)`) : '';
        console.log(pc.dim(`  ${f.relativePath}`) + overBudget);
      }
      console.log('');
    }

    legacyInfo = `\n\n## Existing Reference Files to Migrate

The following files exist outside the context directory. **Read each file using the Read tool**, then include each as a CDD context file in your "files" output (action "created"). For each file:

1. Read the file contents using the Read tool
2. Add YAML frontmatter (name, description) if missing
3. If the file is already compact and project-specific, keep it largely as-is
4. If the file is over 1,500 tokens, compress it:
   - Remove standard knowledge the model already knows from training
   - Keep project-specific decisions, conventions, gotchas, commands
   - Maximum 1 code example per pattern
   - Convert verbose prose to bullet points
   - Remove summary/checklist/resources sections that restate earlier content
5. Do NOT generate separate new files for topics already covered by these files

Files to migrate (read each with the Read tool):\n`;

    for (const f of legacyFiles) {
      const sizeNote = f.tokens > 1500 ? ` (${f.tokens} tokens — compress)` : ` (${f.tokens} tokens)`;
      legacyInfo += `- ${f.relativePath}${sizeNote}\n`;
    }
  }

  let existingInfo = '';
  if (options.includeExisting) {
    if (existingContext.claudeMdContent) {
      existingInfo += `\n\nExisting CLAUDE.md content:\n${existingContext.claudeMdContent}`;
    }
    if (existingContext.contextFiles.length > 0) {
      existingInfo += '\n\nExisting context files:\n';
      for (const f of existingContext.contextFiles) {
        existingInfo += `\n--- ${f.path} ---\n${f.content}\n`;
      }
    }
  }

  // Warn and skip if context already exists (unless --force or --include-existing)
  if (!options.force && existingContext.contextFiles.length > 0 && !options.includeExisting && legacyFiles.length === 0) {
    if (!options.json) {
      console.log(pc.yellow('Root context files already exist:'));
      for (const f of existingContext.contextFiles) {
        console.log(pc.dim(`  ${f.path}`));
      }
      console.log(
        pc.yellow('\nUse --force to overwrite or --include-existing to migrate.'),
      );
    }
    return { status: 'skipped', filesWritten: 0, legacyFilesFound: legacyFiles.length, message: 'Context files already exist' };
  }

  const topicsOverride = options.topics
    ? `\n\nGenerate context files for ONLY these topics: ${options.topics}`
    : '';
  const forceNote = options.force ? '\n\nOverwrite any existing context files.' : '';
  const prompt =
    renderPrompt(PROMPTS.setup, { cwd: repoRoot }) + existingInfo + legacyInfo + topicsOverride + forceNote;

  const promptTokens = estimateTokens(prompt);
  const MAX_PROMPT_TOKENS = 120_000;
  if (promptTokens > MAX_PROMPT_TOKENS) {
    const message = `Setup prompt too large (${promptTokens} tokens, max ${MAX_PROMPT_TOKENS}). Too many legacy files to inline — reduce legacy content or use --filter.`;
    if (!options.json) {
      console.error(pc.red(`Error: ${message}`));
    }
    return { status: 'error', filesWritten: 0, legacyFilesFound: legacyFiles.length, message };
  }

  if (options.dryRun) {
    if (!options.json) {
      console.log(pc.dim('--- Prompt that would be sent to Claude ---'));
      console.log(prompt);
      console.log(pc.dim('--- End prompt ---'));
    }
    return { status: 'skipped', filesWritten: 0, legacyFilesFound: legacyFiles.length, message: 'dry-run' };
  }

  const spinner = yoctoSpinner({ text: 'Analyzing root context with Claude...' }).start();

  try {
    const result = await runAgent({
      prompt,
      cwd: repoRoot,
      verbose: options.verbose,
      timeout: 600_000,
      model: 'claude-sonnet-4-6',
    });

    const setupResult = parseSetupResponse(result.output);

    spinner.success('Root analysis complete');
    const existingPaths = new Set(existingContext.contextFiles.map((f) => f.path));
    const writableFiles = setupResult.files
      .filter((f) => f.content && f.action !== 'skipped')
      .filter((f) => {
        if (options.force || options.includeExisting) return true;
        return !existingPaths.has(f.path);
      });

    if (writableFiles.length === 0) {
      if (!options.json) {
        console.log(pc.yellow('No root files to write.'));
      }
      return { status: 'completed', filesWritten: 0, legacyFilesFound: legacyFiles.length, duration: result.duration, projectType: setupResult.projectType, topics: setupResult.topics };
    }

    // Show plan
    if (!options.json) {
      console.log('');
      console.log(pc.bold('Root files to write:'));
      for (const f of writableFiles) {
        const { icon, color } = getFileActionDisplay(f.action);
        const tokens = estimateTokens(f.content ?? '');
        console.log(color(`  ${icon} ${f.path} (${tokens} tokens)`));
      }
      console.log('');
      console.log(pc.dim(`Project type: ${setupResult.projectType}`));
      console.log(pc.dim(`Topics: ${setupResult.topics.join(', ')}`));
      console.log('');
    }

    // Confirm before writing
    if (!options.yes && !options.json) {
      const confirmed = await confirm('Write these files?');
      if (!confirmed) {
        console.log(pc.dim('Aborted.'));
        return { status: 'skipped', filesWritten: 0, legacyFilesFound: legacyFiles.length, message: 'user aborted' };
      }
    }

    // Write files
    const filesWritten = await writeSetupFiles(repoRoot, writableFiles);

    if (!options.json) {
      console.log('');
      console.log(pc.green(`Wrote ${filesWritten.length} root file(s).`));
      console.log(pc.dim(`Duration: ${(result.duration / 1000).toFixed(1)}s`));
    }

    return { status: 'completed', filesWritten: filesWritten.length, legacyFilesFound: legacyFiles.length, duration: result.duration, projectType: setupResult.projectType, topics: setupResult.topics };
  } catch (error) {
    spinner.error('Root setup failed');

    const message = error instanceof Error ? error.message : 'Unknown error';

    if (!options.json) {
      console.error(pc.red(`Error: ${message}`));
      if (error instanceof ClaudeRunnerError && error.stderr) {
        console.error(pc.dim(error.stderr));
      }
    }

    return { status: 'error', filesWritten: 0, legacyFilesFound: 0, message };
  }
}

async function writeSetupFiles(
  repoRoot: string,
  files: Array<{ path: string; content?: string }>,
): Promise<string[]> {
  const written: string[] = [];
  for (const f of files) {
    if (!f.content) continue;
    const fullPath = safePath(repoRoot, f.path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, f.content, 'utf-8');
    written.push(f.path);
  }
  return written;
}

function getFileActionDisplay(action: string): { icon: string; color: (s: string) => string } {
  switch (action) {
    case 'created':
      return { icon: '+', color: pc.green };
    case 'updated':
      return { icon: '~', color: pc.yellow };
    default:
      return { icon: '-', color: pc.dim };
  }
}

// ---------------------------------------------------------------------------
// --all: per-package setup for monorepos
// ---------------------------------------------------------------------------

interface PackageResult {
  name: string;
  relativePath: string;
  status: 'completed' | 'skipped' | 'error';
  filesWritten?: number;
  duration?: number;
  reason?: string;
  error?: string;
}

async function setupAll(repoRoot: string, options: SetupOptions): Promise<void> {
  const mono = await detectMonorepo(repoRoot);
  if (!mono.isMonorepo) {
    const msg = 'Not a monorepo. Use `cdd setup` without --all for single-package repos.';
    if (options.json) {
      console.log(JSON.stringify({ status: 'error', message: msg }));
    } else {
      console.error(pc.red(`Error: ${msg}`));
    }
    process.exitCode = 1;
    return;
  }

  // Agent SDK requires ANTHROPIC_API_KEY; Claude CLI must also be installed
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- runtime requirement, not build dependency
  if (!process.env.ANTHROPIC_API_KEY) {
    const message = 'ANTHROPIC_API_KEY is required. Set it in your environment.';
    if (options.json) {
      console.log(JSON.stringify({ status: 'error', message }));
    } else {
      console.error(pc.red(`Error: ${message}`));
    }
    process.exitCode = 3;
    return;
  }

  const installed = await checkClaudeInstalled();
  if (!installed) {
    const message = 'Claude CLI not found. Install from https://claude.ai/code';
    if (options.json) {
      console.log(JSON.stringify({ status: 'error', message }));
    } else {
      console.error(pc.red(`Error: ${message}`));
    }
    process.exitCode = 3;
    return;
  }

  // -- Enumerate packages first so we can show the full plan before confirming --
  let packages = await enumeratePackages(repoRoot, mono.workspaceGlobs);

  // Apply --filter
  if (options.filter) {
    const filterSet = new Set(options.filter.split(',').map((s) => s.trim()));
    packages = packages.filter(
      (p) => filterSet.has(p.name) || filterSet.has(p.relativePath) || filterSet.has(p.relativePath.split('/').pop() ?? ''),
    );
  }

  // Skip packages that already have context (unless --force)
  if (!options.force) {
    packages = packages.filter((p) => {
      if (p.hasClaudeMd && p.hasContextDir) return false;
      return true;
    });
  }

  if (packages.length === 0) {
    const msg = 'No packages to set up. All packages already have context files (use --force to overwrite).';
    if (options.json) {
      console.log(JSON.stringify({ status: 'completed', packages: [], message: msg }));
    } else {
      console.log(pc.yellow(msg));
    }
    return;
  }

  if (!options.json) {
    console.log(pc.bold(`Monorepo detected: root + ${packages.length} package(s) to set up`));
    for (const p of packages) {
      const label = p.hasClaudeMd ? pc.dim(' (has CLAUDE.md)') : '';
      console.log(pc.dim(`  ${p.relativePath}`) + label);
    }
    console.log('');
  }

  // Single upfront confirmation for the entire --all operation (root + packages)
  if (!options.yes && !options.json && !options.dryRun) {
    const confirmed = await confirm(`Set up root + ${packages.length} package(s)?`);
    if (!confirmed) {
      console.log(pc.dim('Aborted.'));
      return;
    }
  }

  // -- Phase 1: Setup root context first --
  // Root context is processed first so packages can use the migrated/compressed
  // root context as their base for analysis.
  if (!options.json) {
    console.log('');
    console.log(pc.bold('Phase 1: Root context'));
  }
  // Pass yes: true since the user already confirmed above
  const rootResult = await setupRoot(repoRoot, { ...options, yes: true });
  if (rootResult.status === 'error') {
    if (options.json) {
      console.log(JSON.stringify({ status: 'error', root: rootResult }));
    } else {
      console.error(pc.red(`Root setup failed: ${rootResult.message ?? 'unknown error'}`));
    }
    process.exitCode = 1;
    return;
  }
  if (!options.json) {
    if (rootResult.status === 'completed' && rootResult.filesWritten > 0) {
      console.log('');
    } else if (rootResult.status === 'skipped') {
      console.log(pc.dim(`  Root: skipped (${rootResult.message ?? 'already exists'})`));
    }
    console.log('');
    console.log(pc.bold(`Phase 2: ${packages.length} package(s)`));
  }

  // Gather root context for the prompt (re-scan after root setup to pick up new files)
  const rootContext = await buildRootContextSummary(repoRoot);

  // Process packages sequentially — one at a time, agent team per package
  const results: PackageResult[] = [];
  const startTime = Date.now();

  for (const pkg of packages) {
    const result = await setupSinglePackage(repoRoot, pkg, rootContext, options);
    results.push(result);

    if (!options.json) {
      let icon = pc.red('✗');
      if (result.status === 'completed') icon = pc.green('✓');
      else if (result.status === 'skipped') icon = pc.yellow('—');
      const detail = result.status === 'completed'
        ? `${result.filesWritten} file(s), ${((result.duration ?? 0) / 1000).toFixed(1)}s`
        : result.reason ?? result.error ?? '';
      console.log(`${icon} ${pkg.relativePath} ${pc.dim(detail)}`);
    }
  }

  const totalDuration = Date.now() - startTime;
  const completed = results.filter((r) => r.status === 'completed');
  const totalFiles = completed.reduce((sum, r) => sum + (r.filesWritten ?? 0), 0);

  const rootFiles = rootResult.filesWritten;

  if (options.json) {
    console.log(JSON.stringify({ status: 'completed', root: rootResult, packages: results, totalDuration }));
  } else {
    console.log('');
    console.log(pc.green(`Done: ${completed.length}/${results.length} packages, ${totalFiles + rootFiles} file(s) written`));
    if (rootFiles > 0) {
      console.log(pc.dim(`  Root: ${rootFiles} file(s)`));
    }
    console.log(pc.dim(`Total: ${(totalDuration / 1000).toFixed(1)}s`));
    console.log('');
    console.log(`Run ${pc.cyan('cdd curate')} to validate the generated context.`);
  }
}

async function setupSinglePackage(
  repoRoot: string,
  pkg: { name: string; path: string; relativePath: string },
  rootContext: string,
  options: SetupOptions,
): Promise<PackageResult> {
  const prompt = renderPrompt(PROMPTS.setupPackage, {
    cwd: repoRoot,
    packagePath: pkg.relativePath,
    packageName: pkg.name,
    rootContext,
  });

  if (options.dryRun) {
    return { name: pkg.name, relativePath: pkg.relativePath, status: 'skipped', reason: 'dry-run' };
  }

  try {
    const result = await runAgent({
      prompt,
      cwd: repoRoot,
      verbose: options.verbose,
      timeout: 300_000,
      model: 'claude-sonnet-4-6',
    });

    const setupResult = parseSetupResponse(result.output);
    const writableFiles = setupResult.files.filter((f) => f.content && f.action !== 'skipped');

    if (writableFiles.length === 0) {
      return { name: pkg.name, relativePath: pkg.relativePath, status: 'skipped', reason: 'no files generated', duration: result.duration };
    }

    const written = await writeSetupFiles(repoRoot, writableFiles);

    return {
      name: pkg.name,
      relativePath: pkg.relativePath,
      status: 'completed',
      filesWritten: written.length,
      duration: result.duration,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { name: pkg.name, relativePath: pkg.relativePath, status: 'error', error: message };
  }
}

async function buildRootContextSummary(repoRoot: string): Promise<string> {
  const ctx = await scanRepo(repoRoot);
  const parts: string[] = [];

  if (ctx.claudeMdContent) {
    // Truncate to keep prompt reasonable
    const content = ctx.claudeMdContent.length > 3000
      ? ctx.claudeMdContent.slice(0, 3000) + '\n[...truncated]'
      : ctx.claudeMdContent;
    parts.push(`### Root CLAUDE.md\n\n${content}`);
  }

  if (ctx.contextFiles.length > 0) {
    parts.push('### Root Context Files\n');
    for (const f of ctx.contextFiles) {
      parts.push(`- ${f.path}: ${f.frontmatter?.description ?? '(no description)'} (${f.tokens}t)`);
    }
  }

  return parts.length > 0 ? parts.join('\n\n') : '(No root context files found)';
}
