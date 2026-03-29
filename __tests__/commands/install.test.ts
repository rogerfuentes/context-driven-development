import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, rm, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock findRepoRoot before importing install
vi.mock('../../src/utils/git.js', () => ({
  findRepoRoot: vi.fn(),
}));

import { install } from '../../src/commands/install.js';
import { findRepoRoot } from '../../src/utils/git.js';
import { COMMAND_FILES } from '../../src/assets/command-files.js';

const mockedFindRepoRoot = vi.mocked(findRepoRoot);

describe('install command', () => {
  let tempDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cdd-test-install-'));
    await mkdir(join(tempDir, '.git'));
    mockedFindRepoRoot.mockResolvedValue(tempDir);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.exitCode = undefined;
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('creates .claude/commands/ directory when it does not exist', async () => {
    await install({});

    const entries = await readdir(join(tempDir, '.claude', 'commands'));
    expect(entries.length).toBeGreaterThan(0);
  });

  it('writes all 4 command files', async () => {
    await install({});

    const commandsDir = join(tempDir, '.claude', 'commands');
    const entries = await readdir(commandsDir);
    const mdFiles = entries.filter((f) => f.endsWith('.md'));

    expect(mdFiles).toHaveLength(4);
    expect(mdFiles.sort()).toEqual([
      'cdd-curate.md',
      'cdd-health.md',
      'cdd-learn.md',
      'cdd-setup.md',
    ]);
  });

  it('writes .cdd-version file with correct version', async () => {
    await install({});

    const versionContent = await readFile(join(tempDir, '.cdd-version'), 'utf-8');
    // Should be a semver-like string followed by newline
    expect(versionContent.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('overwrites existing files on re-run (idempotent)', async () => {
    await install({});
    // Run again - should not throw
    await install({});

    const commandsDir = join(tempDir, '.claude', 'commands');
    const entries = await readdir(commandsDir);
    const mdFiles = entries.filter((f) => f.endsWith('.md'));
    expect(mdFiles).toHaveLength(4);
  });

  it('files contain expected content headers', async () => {
    await install({});

    const commandsDir = join(tempDir, '.claude', 'commands');

    const setupContent = await readFile(join(commandsDir, 'cdd-setup.md'), 'utf-8');
    expect(setupContent).toContain('Initialize CDD context files');
    expect(setupContent).toContain('## Instructions');

    const curateContent = await readFile(join(commandsDir, 'cdd-curate.md'), 'utf-8');
    expect(curateContent).toContain('Audit the quality');

    const healthContent = await readFile(join(commandsDir, 'cdd-health.md'), 'utf-8');
    expect(healthContent).toContain('Measure the health');

    const learnContent = await readFile(join(commandsDir, 'cdd-learn.md'), 'utf-8');
    expect(learnContent).toContain('Extract knowledge');
  });

  it('command files contain CLI integration content', async () => {
    await install({});

    const commandsDir = join(tempDir, '.claude', 'commands');

    const curateContent = await readFile(join(commandsDir, 'cdd-curate.md'), 'utf-8');
    expect(curateContent).toContain('cdd curate --json');

    const healthContent = await readFile(join(commandsDir, 'cdd-health.md'), 'utf-8');
    expect(healthContent).toContain('cdd health --json');

    const learnContent = await readFile(join(commandsDir, 'cdd-learn.md'), 'utf-8');
    expect(learnContent).toContain('cdd curate --json');
  });

  it('command file contents match COMMAND_FILES source', async () => {
    await install({});

    const commandsDir = join(tempDir, '.claude', 'commands');
    for (const [name, expectedContent] of Object.entries(COMMAND_FILES)) {
      const actual = await readFile(join(commandsDir, `${name}.md`), 'utf-8');
      // Content should match (VERSION placeholder replaced, but none exist currently)
      expect(actual).toBe(expectedContent);
    }
  });

  it('returns install result with file paths', async () => {
    const result = await install({});

    expect(result).toBeDefined();
    expect(result!.status).toBe('installed');
    expect(result!.command).toBe('install');
    expect(result!.repoRoot).toBe(tempDir);
    expect(result!.filesWritten).toHaveLength(5); // 4 commands + .cdd-version
    expect(result!.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('prints error when not in a git repo', async () => {
    mockedFindRepoRoot.mockRejectedValue(new Error('Not inside a git repository'));

    const result = await install({});

    expect(result).toBeUndefined();
    expect(process.exitCode).toBe(1);
  });

  it('outputs JSON when --json flag is set', async () => {
    await install({ json: true });

    const output = logSpy.mock.calls.find((call) => {
      try {
        const parsed = JSON.parse(call[0] as string);
        return parsed.status === 'installed';
      } catch {
        return false;
      }
    });

    expect(output).toBeDefined();
    const parsed = JSON.parse(output![0] as string);
    expect(parsed.status).toBe('installed');
    expect(parsed.filesWritten).toHaveLength(5);
    expect(parsed.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('outputs JSON error when not in git repo with --json', async () => {
    mockedFindRepoRoot.mockRejectedValue(new Error('Not inside a git repository'));

    await install({ json: true });

    const output = logSpy.mock.calls.find((call) => {
      try {
        const parsed = JSON.parse(call[0] as string);
        return parsed.status === 'error';
      } catch {
        return false;
      }
    });

    expect(output).toBeDefined();
    const parsed = JSON.parse(output![0] as string);
    expect(parsed.error).toContain('git repository');
  });

  it('handles dry run mode', async () => {
    await install({ dryRun: true });

    // No files should be written
    const commandsDirExists = await readdir(join(tempDir, '.claude', 'commands')).catch(() => null);
    expect(commandsDirExists).toBeNull();
  });

  it('handles dry run with --json', async () => {
    await install({ dryRun: true, json: true });

    const output = logSpy.mock.calls.find((call) => {
      try {
        const parsed = JSON.parse(call[0] as string);
        return parsed.status === 'dry_run';
      } catch {
        return false;
      }
    });

    expect(output).toBeDefined();
    const parsed = JSON.parse(output![0] as string);
    expect(parsed.filesWouldWrite.length).toBeGreaterThan(0);
  });

  it('force flag does not change behavior (install always overwrites)', async () => {
    await install({});
    const result = await install({ force: true });

    expect(result).toBeDefined();
    expect(result!.status).toBe('installed');
    expect(result!.filesWritten).toHaveLength(5);
  });
});
