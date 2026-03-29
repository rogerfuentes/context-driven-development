import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock external dependencies before importing curate
vi.mock('../../src/utils/git.js', () => ({
  findRepoRoot: vi.fn(),
}));

vi.mock('../../src/claude/runner.js', () => ({
  run: vi.fn(),
  checkClaudeInstalled: vi.fn(),
  ClaudeRunnerError: class ClaudeRunnerError extends Error {
    exitCode: number;
    stderr: string;
    constructor(msg: string, code: number, stderr: string) {
      super(msg);
      this.name = 'ClaudeRunnerError';
      this.exitCode = code;
      this.stderr = stderr;
    }
  },
}));

// Mock yocto-spinner since it writes to stderr in tests
vi.mock('yocto-spinner', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    success: vi.fn().mockReturnThis(),
    error: vi.fn().mockReturnThis(),
  })),
}));

import { curate } from '../../src/commands/curate.js';
import { findRepoRoot } from '../../src/utils/git.js';
import { run, checkClaudeInstalled, ClaudeRunnerError } from '../../src/claude/runner.js';

const mockedFindRepoRoot = vi.mocked(findRepoRoot);
const mockedCheckClaudeInstalled = vi.mocked(checkClaudeInstalled);
const mockedRun = vi.mocked(run);

describe('curate --full', () => {
  let tempDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cdd-test-curate-full-'));
    await mkdir(join(tempDir, '.git'));
    await mkdir(join(tempDir, '.claude/context'), { recursive: true });
    mockedFindRepoRoot.mockResolvedValue(tempDir);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.exitCode = undefined;
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    logSpy.mockRestore();
    errorSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('prints warning and returns static results when Claude is not installed', async () => {
    await writeFile(join(tempDir, 'CLAUDE.md'), 'Short file.\n');
    await writeFile(
      join(tempDir, '.claude/context', 'style.md'),
      'Use ESLint for linting.\n',
    );

    mockedCheckClaudeInstalled.mockResolvedValue(false);

    await curate({ full: true });

    const allOutput = logSpy.mock.calls.map((c) => String(c[0])).join('\n');

    // Should have printed a warning about Claude not being installed
    expect(allOutput).toContain('Claude CLI not found');
    expect(allOutput).toContain('skipping semantic checks');

    // Should still have produced a report (static checks ran)
    expect(allOutput).toContain('CDD Curate Report');

    // Claude run should NOT have been called
    expect(mockedRun).not.toHaveBeenCalled();
  });

  it('runs semantic checks and merges findings when Claude is available', async () => {
    await writeFile(join(tempDir, 'CLAUDE.md'), 'Short file.\n');
    await writeFile(
      join(tempDir, '.claude/context', 'style.md'),
      'Use ESLint for linting.\n',
    );

    const claudeResponse = JSON.stringify({
      findings: [
        {
          severity: 'warning',
          rule: 'stale-reference',
          message: 'References a pattern that no longer exists',
          file: '.claude/context/style.md',
        },
      ],
    });

    mockedCheckClaudeInstalled.mockResolvedValue(true);
    mockedRun.mockResolvedValue({
      output: claudeResponse,
      exitCode: 0,
      duration: 5000,
    });

    await curate({ full: true, json: true });

    // Claude should have been called
    expect(mockedRun).toHaveBeenCalledTimes(1);

    // The prompt should include context file contents
    const callArgs = mockedRun.mock.calls[0][0];
    expect(callArgs.prompt).toContain('CLAUDE.md');
    expect(callArgs.prompt).toContain('style.md');
    expect(callArgs.prompt).toContain('Use ESLint for linting');

    // Parse the JSON output
    const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    const parsed = JSON.parse(output);

    // Should include the semantic finding from Claude
    expect(parsed.findings.some((f: { rule: string }) => f.rule === 'stale-reference')).toBe(true);

    // Should also include static findings (e.g. from the trivial CLAUDE.md)
    expect(parsed.findings.length).toBeGreaterThan(1);
  });

  it('continues with static results when Claude fails', async () => {
    await writeFile(join(tempDir, 'CLAUDE.md'), 'Short file.\n');
    await writeFile(
      join(tempDir, '.claude/context', 'style.md'),
      'Use ESLint for linting.\n',
    );

    mockedCheckClaudeInstalled.mockResolvedValue(true);
    mockedRun.mockRejectedValue(
      new ClaudeRunnerError('Claude timed out', 1, ''),
    );

    await curate({ full: true, json: true });

    // Should still produce a JSON report with static findings only
    const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    const parsed = JSON.parse(output);
    expect(typeof parsed.score).toBe('number');
    expect(Array.isArray(parsed.findings)).toBe(true);
    // Should NOT contain semantic findings since Claude failed
    expect(parsed.findings.every((f: { rule: string }) => f.rule !== 'stale-reference')).toBe(true);
  });

  it('skips semantic checks when no context files exist', async () => {
    // Empty repo -- no CLAUDE.md, no context files
    // Remove the .claude/context dir we created in beforeEach
    await rm(join(tempDir, '.claude/context'), { recursive: true, force: true });

    mockedCheckClaudeInstalled.mockResolvedValue(true);

    await curate({ full: true, json: true });

    // Claude should NOT have been called -- nothing to analyze
    expect(mockedRun).not.toHaveBeenCalled();
  });

  it('does not fail the overall command when semantic checks fail', async () => {
    await writeFile(join(tempDir, 'CLAUDE.md'), 'Line\n'.repeat(60));
    await writeFile(
      join(tempDir, '.claude/context', 'style.md'),
      '---\nname: Style Guide\ndescription: Code style conventions\n---\n# Style Guide\nUse ESLint.\n',
    );

    mockedCheckClaudeInstalled.mockResolvedValue(true);
    mockedRun.mockRejectedValue(new Error('Unexpected failure'));

    // Should not throw
    await curate({ full: true });

    // Should still have produced a report
    const allOutput = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toContain('CDD Curate Report');
  });
});
