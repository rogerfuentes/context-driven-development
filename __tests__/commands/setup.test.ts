import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock external dependencies before importing setup
vi.mock('../../src/utils/git.js', () => ({
  findRepoRoot: vi.fn(),
}));

vi.mock('../../src/claude/runner.js', () => ({
  run: vi.fn(),
  runAgent: vi.fn(),
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

vi.mock('../../src/utils/confirm.js', () => ({
  confirm: vi.fn().mockResolvedValue(true),
}));

// Must also mock yocto-spinner since it writes to stderr in tests
vi.mock('yocto-spinner', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    success: vi.fn().mockReturnThis(),
    error: vi.fn().mockReturnThis(),
  })),
}));

import { setup } from '../../src/commands/setup.js';
import { findRepoRoot } from '../../src/utils/git.js';
import { runAgent, checkClaudeInstalled, ClaudeRunnerError } from '../../src/claude/runner.js';

const mockedFindRepoRoot = vi.mocked(findRepoRoot);
const mockedCheckClaudeInstalled = vi.mocked(checkClaudeInstalled);
const mockedRunAgent = vi.mocked(runAgent);

describe('setup command', () => {
  let tempDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  let originalApiKey: string | undefined;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cdd-test-setup-'));
    await mkdir(join(tempDir, '.git'));
    mockedFindRepoRoot.mockResolvedValue(tempDir);
    mockedCheckClaudeInstalled.mockResolvedValue(true);
    originalApiKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-key';
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.exitCode = undefined;
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    logSpy.mockRestore();
    errorSpy.mockRestore();
    if (originalApiKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    vi.clearAllMocks();
  });

  it('sets exitCode 3 when ANTHROPIC_API_KEY is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    await setup({});

    expect(process.exitCode).toBe(3);
    expect(errorSpy).toHaveBeenCalled();
    const errorMsg = errorSpy.mock.calls[0]?.[0] as string;
    expect(errorMsg).toContain('ANTHROPIC_API_KEY');
  });

  it('outputs JSON error when ANTHROPIC_API_KEY is missing with --json', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    await setup({ json: true });

    expect(process.exitCode).toBe(3);
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
    expect(parsed.message).toContain('ANTHROPIC_API_KEY');
  });

  it('sets exitCode 3 when Claude CLI is not installed', async () => {
    mockedCheckClaudeInstalled.mockResolvedValue(false);

    await setup({});

    expect(process.exitCode).toBe(3);
    expect(errorSpy).toHaveBeenCalled();
    const errorMsg = errorSpy.mock.calls[0]?.[0] as string;
    expect(errorMsg).toContain('Claude CLI not found');
  });

  it('skips when context files exist and no --force', async () => {
    // Create existing context files
    await mkdir(join(tempDir, '.claude/context'), { recursive: true });
    await writeFile(
      join(tempDir, '.claude/context', 'style.md'),
      '---\nname: Style\ndescription: test\n---\n# Style\n',
    );

    await setup({});

    // Should not call run
    expect(mockedRunAgent).not.toHaveBeenCalled();
    // Should print warning about existing files
    const allOutput = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('already exist');
  });

  it('skips with JSON output when context files exist', async () => {
    await mkdir(join(tempDir, '.claude/context'), { recursive: true });
    await writeFile(
      join(tempDir, '.claude/context', 'style.md'),
      '---\nname: Style\ndescription: test\n---\n# Style\n',
    );

    await setup({ json: true });

    expect(mockedRunAgent).not.toHaveBeenCalled();
    const output = logSpy.mock.calls.find((call) => {
      try {
        const parsed = JSON.parse(call[0] as string);
        return parsed.status === 'skipped';
      } catch {
        return false;
      }
    });
    expect(output).toBeDefined();
    const parsed = JSON.parse(output![0] as string);
    expect(parsed.status).toBe('skipped');
    expect(parsed.message).toContain('already exist');
  });

  it('runs Claude when --force is set even if context exists', async () => {
    await mkdir(join(tempDir, '.claude/context'), { recursive: true });
    await writeFile(
      join(tempDir, '.claude/context', 'style.md'),
      '---\nname: Style\ndescription: test\n---\n# Style\n',
    );

    const jsonResponse = JSON.stringify({
      files: [{ path: 'CLAUDE.md', action: 'created' }],
      projectType: 'TypeScript',
      topics: ['architecture'],
    });
    mockedRunAgent.mockResolvedValue({ output: jsonResponse, exitCode: 0, duration: 5000 });

    await setup({ force: true });

    expect(mockedRunAgent).toHaveBeenCalled();
  });

  it('passes --include-existing content to prompt', async () => {
    await mkdir(join(tempDir, '.claude/context'), { recursive: true });
    await writeFile(join(tempDir, 'CLAUDE.md'), '# My Project\nSome content.');
    await writeFile(
      join(tempDir, '.claude/context', 'style.md'),
      '---\nname: Style\ndescription: test\n---\n# Style\nUse ESLint.\n',
    );

    const jsonResponse = JSON.stringify({
      files: [{ path: 'CLAUDE.md', action: 'updated' }],
      projectType: 'Node.js',
      topics: ['code-style'],
    });
    mockedRunAgent.mockResolvedValue({ output: jsonResponse, exitCode: 0, duration: 3000 });

    await setup({ includeExisting: true });

    expect(mockedRunAgent).toHaveBeenCalled();
    const promptArg = mockedRunAgent.mock.calls[0][0].prompt;
    expect(promptArg).toContain('Existing CLAUDE.md content:');
    expect(promptArg).toContain('Some content.');
    expect(promptArg).toContain('Existing context files:');
    expect(promptArg).toContain('Use ESLint.');
  });

  it('dry run shows prompt without running Claude', async () => {
    await setup({ dryRun: true });

    expect(mockedRunAgent).not.toHaveBeenCalled();
    const allOutput = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('Prompt that would be sent to Claude');
    expect(allOutput).toContain('End prompt');
  });

  it('dry run with --json outputs structured result', async () => {
    await setup({ dryRun: true, json: true });

    expect(mockedRunAgent).not.toHaveBeenCalled();
    const output = logSpy.mock.calls.find((call) => {
      try {
        const parsed = JSON.parse(call[0] as string);
        return parsed.status === 'skipped';
      } catch {
        return false;
      }
    });
    expect(output).toBeDefined();
    const parsed = JSON.parse(output![0] as string);
    expect(parsed.message).toBe('dry-run');
  });

  it('parses JSON response from Claude', async () => {
    const jsonResponse = JSON.stringify({
      files: [
        { path: 'CLAUDE.md', action: 'created', content: '# Project\n' },
        { path: '.claude/context/architecture.md', action: 'created', content: '---\nname: Arch\n---\n' },
      ],
      projectType: 'TypeScript monorepo',
      topics: ['architecture', 'testing'],
    });
    mockedRunAgent.mockResolvedValue({ output: jsonResponse, exitCode: 0, duration: 8000 });

    await setup({});

    const allOutput = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('CLAUDE.md');
    expect(allOutput).toContain('TypeScript monorepo');
    expect(allOutput).toContain('architecture, testing');
    expect(allOutput).toContain('Wrote 2 root file(s)');
    expect(allOutput).toContain('cdd curate');
  });

  it('JSON output mode returns structured result', async () => {
    const jsonResponse = JSON.stringify({
      files: [{ path: 'CLAUDE.md', action: 'created', content: '# Project\n' }],
      projectType: 'React',
      topics: ['frontend'],
    });
    mockedRunAgent.mockResolvedValue({ output: jsonResponse, exitCode: 0, duration: 2000 });

    await setup({ json: true });

    const output = logSpy.mock.calls.find((call) => {
      try {
        const parsed = JSON.parse(call[0] as string);
        return parsed.status === 'completed';
      } catch {
        return false;
      }
    });
    expect(output).toBeDefined();
    const parsed = JSON.parse(output![0] as string);
    expect(parsed.status).toBe('completed');
    expect(parsed.duration).toBe(2000);
    expect(parsed.filesWritten).toBe(1);
    expect(parsed.projectType).toBe('React');
    expect(parsed.topics).toEqual(['frontend']);
  });

  it('handles Claude runner error gracefully', async () => {
    const RunnerError = ClaudeRunnerError as unknown as new (
      msg: string,
      code: number,
      stderr: string,
    ) => Error & { exitCode: number; stderr: string };
    mockedRunAgent.mockRejectedValue(new RunnerError('Claude crashed', 1, 'segfault'));

    await setup({});

    expect(process.exitCode).toBe(1);
    const errorOutput = errorSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(errorOutput).toContain('Claude crashed');
  });

  it('handles Claude runner error with --json', async () => {
    const RunnerError = ClaudeRunnerError as unknown as new (
      msg: string,
      code: number,
      stderr: string,
    ) => Error & { exitCode: number; stderr: string };
    mockedRunAgent.mockRejectedValue(new RunnerError('Timeout', 1, ''));

    await setup({ json: true });

    expect(process.exitCode).toBe(1);
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
    expect(parsed.message).toContain('Timeout');
  });

  it('sets exitCode 1 when repo root is not found', async () => {
    mockedFindRepoRoot.mockRejectedValue(new Error('Not inside a git repository'));

    await setup({});

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('appends topics override to prompt when --topics is set', async () => {
    const jsonResponse = JSON.stringify({
      files: [],
      projectType: 'unknown',
      topics: [],
    });
    mockedRunAgent.mockResolvedValue({ output: jsonResponse, exitCode: 0, duration: 1000 });

    await setup({ topics: 'architecture,testing' });

    const promptArg = mockedRunAgent.mock.calls[0][0].prompt;
    expect(promptArg).toContain('ONLY these topics: architecture,testing');
  });

  it('appends force note to prompt when --force is set', async () => {
    const jsonResponse = JSON.stringify({
      files: [],
      projectType: 'unknown',
      topics: [],
    });
    mockedRunAgent.mockResolvedValue({ output: jsonResponse, exitCode: 0, duration: 1000 });

    await setup({ force: true });

    const promptArg = mockedRunAgent.mock.calls[0][0].prompt;
    expect(promptArg).toContain('Overwrite any existing context files');
  });

  it('uses 600s timeout for Claude agent run', async () => {
    const jsonResponse = JSON.stringify({
      files: [],
      projectType: 'unknown',
      topics: [],
    });
    mockedRunAgent.mockResolvedValue({ output: jsonResponse, exitCode: 0, duration: 1000 });

    await setup({});

    expect(mockedRunAgent.mock.calls[0][0].timeout).toBe(600_000);
  });
});
