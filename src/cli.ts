import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';
import { install } from './commands/install.js';
import { setup } from './commands/setup.js';
import { curate } from './commands/curate.js';
import { health } from './commands/health.js';
import { status } from './commands/status.js';
import { learn } from './commands/learn.js';

const cliDir = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(join(cliDir, '..', 'package.json'), 'utf-8'));

const program = new Command();

program
  .name('cdd')
  .description('CDD — Context-Driven Development CLI for AI context management')
  .version(version)
  .option('--json', 'Output machine-readable JSON')
  .option('--verbose', 'Show detailed output')
  .option('--dry-run', 'Show what would happen without executing')
  .option('-y, --yes', 'Skip confirmation prompts (for CI)');

program
  .command('install')
  .description('Install CDD commands into the current repository')
  .action(async () => {
    const opts = program.opts();
    await install({ json: opts.json, verbose: opts.verbose, dryRun: opts.dryRun });
  });

program
  .command('setup')
  .description('Scaffold CDD context files for the current repository')
  .option('--force', 'Overwrite existing files')
  .option('--topics <list>', 'Comma-separated list of topics to include')
  .option('--include-existing', 'Include existing context files in scaffold')
  .option('--all', 'Setup all packages in a monorepo')
  .option('--filter <packages>', 'Comma-separated package names to setup (with --all)')
  .option('--concurrency <n>', 'Max concurrent Claude calls (with --all)', '2')
  .action(async (cmdOpts) => {
    const opts = program.opts();
    await setup({
      json: opts.json,
      verbose: opts.verbose,
      dryRun: opts.dryRun,
      force: cmdOpts.force,
      topics: cmdOpts.topics,
      includeExisting: cmdOpts.includeExisting,
      yes: opts.yes,
      all: cmdOpts.all,
      filter: cmdOpts.filter,
      concurrency: cmdOpts.concurrency ? parseInt(cmdOpts.concurrency as string, 10) : undefined,
    });
  });

program
  .command('curate')
  .description('Audit context file quality')
  .option('--full', 'Run semantic checks with Claude')
  .action(async (cmdOpts) => {
    const opts = program.opts();
    await curate({
      json: opts.json,
      verbose: opts.verbose,
      dryRun: opts.dryRun,
      full: cmdOpts.full,
    });
  });

program
  .command('health')
  .description('Measure context health score')
  .option('--package <name>', 'Target a specific monorepo package')
  .option('--all', 'Run health check across all packages')
  .action(async (cmdOpts) => {
    const opts = program.opts();
    await health({
      json: opts.json,
      verbose: opts.verbose,
      dryRun: opts.dryRun,
      package: cmdOpts.package,
      all: cmdOpts.all,
    });
  });

program
  .command('status')
  .description('Show progress across all specs')
  .option('--specs-dir <path>', 'Additional specs directory to scan')
  .action(async (cmdOpts) => {
    const opts = program.opts();
    await status({
      json: opts.json,
      verbose: opts.verbose,
      specsDir: cmdOpts.specsDir,
    });
  });

program
  .command('learn [prompt...]')
  .description('Extract knowledge from a work session')
  .option('--merge <file>', 'Merge extracted knowledge into an existing file')
  .option('--session <id>', 'Read a Claude Code session transcript by UUID')
  .option('--file <path>', 'Read a local file as source material')
  .option('--url <url>', 'Fetch a URL as source material')
  .action(async (promptParts: string[], cmdOpts) => {
    const opts = program.opts();
    await learn({
      json: opts.json,
      verbose: opts.verbose,
      dryRun: opts.dryRun,
      merge: cmdOpts.merge,
      session: cmdOpts.session,
      file: cmdOpts.file,
      url: cmdOpts.url,
      prompt: promptParts.length > 0 ? promptParts.join(' ') : undefined,
      yes: opts.yes,
    });
  });

program
  .command('update-commands')
  .description('Re-install CDD commands (alias for install --force)')
  .action(async () => {
    const opts = program.opts();
    await install({ json: opts.json, verbose: opts.verbose, dryRun: opts.dryRun, force: true });
  });

program.parseAsync();
