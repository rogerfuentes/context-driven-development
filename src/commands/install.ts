import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';
import yoctoSpinner from 'yocto-spinner';

import { COMMAND_FILES } from '../assets/command-files.js';
import { findRepoRoot } from '../utils/git.js';

export interface InstallOptions {
  json?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
  force?: boolean;
}

export interface InstallResult {
  status: 'installed';
  command: 'install';
  repoRoot: string;
  filesWritten: string[];
  version: string;
}

async function getPackageVersion(): Promise<string> {
  let dir = dirname(fileURLToPath(import.meta.url));

  // Walk up directories to find our package.json (works from both src/ and dist/)
  for (let i = 0; i < 5; i++) {
    try {
      const content = await readFile(join(dir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(content);
      if (pkg.name === 'cdd') {
        return pkg.version;
      }
    } catch {
      // Not found at this level, keep looking
    }
    dir = dirname(dir);
  }

  return '0.0.0';
}

export async function install(options: InstallOptions): Promise<InstallResult | undefined> {
  const version = await getPackageVersion();

  let repoRoot: string;
  try {
    repoRoot = await findRepoRoot();
  } catch {
    if (options.json) {
      console.log(JSON.stringify({ status: 'error', command: 'install', error: 'Not inside a git repository' }));
    } else {
      console.error(pc.red('Error: Not inside a git repository'));
    }
    process.exitCode = 1;
    return undefined;
  }

  const commandsDir = join(repoRoot, '.claude', 'commands');
  const filesWritten: string[] = [];

  if (options.dryRun) {
    if (options.json) {
      const files = Object.keys(COMMAND_FILES).map((name) => join(commandsDir, `${name}.md`));
      console.log(JSON.stringify({
        status: 'dry_run',
        command: 'install',
        repoRoot,
        filesWouldWrite: [...files, join(repoRoot, '.cdd-version')],
        version,
      }));
      return undefined;
    }
    console.log(pc.cyan('Dry run — would install the following files:'));
    for (const name of Object.keys(COMMAND_FILES)) {
      console.log(`  ${join(commandsDir, `${name}.md`)}`);
    }
    console.log(`  ${join(repoRoot, '.cdd-version')}`);
    return undefined;
  }

  const spinner = yoctoSpinner({ text: 'Installing CDD commands...' }).start();

  try {
    await mkdir(commandsDir, { recursive: true });

    for (const [name, content] of Object.entries(COMMAND_FILES)) {
      const filePath = join(commandsDir, `${name}.md`);
      const finalContent = content.replace(/\{\{VERSION\}\}/g, version);
      await writeFile(filePath, finalContent, 'utf-8');
      filesWritten.push(filePath);
    }

    const versionFilePath = join(repoRoot, '.cdd-version');
    await writeFile(versionFilePath, version + '\n', 'utf-8');
    filesWritten.push(versionFilePath);

    spinner.success('CDD commands installed');

    if (options.json) {
      const result: InstallResult = {
        status: 'installed',
        command: 'install',
        repoRoot,
        filesWritten,
        version,
      };
      console.log(JSON.stringify(result));
      return result;
    }

    if (options.verbose) {
      console.log(pc.dim('\nFiles written:'));
      for (const file of filesWritten) {
        console.log(pc.dim(`  ${file}`));
      }
    }

    console.log('');
    console.log(`  ${pc.green('4 commands')} installed to ${pc.cyan('.claude/commands/')}`);
    console.log(`  ${pc.dim('version')} ${version}`);
    console.log('');
    console.log('  Use in Claude Code:');
    console.log(`    ${pc.cyan('/cdd-setup')}       — scaffold context files`);
    console.log(`    ${pc.cyan('/cdd-curate')}     — audit context quality`);
    console.log(`    ${pc.cyan('/cdd-health')}  — measure context health`);
    console.log(`    ${pc.cyan('/cdd-learn')}      — extract session knowledge`);

    return { status: 'installed', command: 'install', repoRoot, filesWritten, version };
  } catch (error) {
    spinner.error('Failed to install CDD commands');
    const message = error instanceof Error ? error.message : 'Unknown error';
    process.exitCode = 1;
    if (options.json) {
      console.log(JSON.stringify({ status: 'error', command: 'install', error: message }));
      return undefined;
    }
    console.error(pc.red(`Error: ${message}`));
    return undefined;
  }
}
