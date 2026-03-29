import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const TMP_DIR = join(process.cwd(), '__tests__', '.tmp-learn');

// Mock external dependencies before importing learn
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

vi.mock('../../src/quality/scanner.js', () => ({
  scanRepo: vi.fn(),
}));

vi.mock('../../src/config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../src/commands/learn-source.js', () => ({
  gatherSource: vi.fn(),
}));

vi.mock('../../src/utils/confirm.js', () => ({
  confirm: vi.fn().mockResolvedValue(true),
}));

// Must mock yocto-spinner since it writes to stderr in tests
vi.mock('yocto-spinner', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    success: vi.fn().mockReturnThis(),
    error: vi.fn().mockReturnThis(),
  })),
}));

import { run, checkClaudeInstalled, ClaudeRunnerError } from '../../src/claude/runner.js';
import { findRepoRoot } from '../../src/utils/git.js';
import { scanRepo } from '../../src/quality/scanner.js';
import { gatherSource } from '../../src/commands/learn-source.js';
import { confirm } from '../../src/utils/confirm.js';
import { learn } from '../../src/commands/learn.js';

const mockRun = vi.mocked(run);
const mockConfirm = vi.mocked(confirm);
const mockCheckClaude = vi.mocked(checkClaudeInstalled);
const mockFindRepoRoot = vi.mocked(findRepoRoot);
const mockScanRepo = vi.mocked(scanRepo);
const mockGatherSource = vi.mocked(gatherSource);

describe('learn command', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    process.exitCode = undefined;
    await mkdir(join(TMP_DIR, '.git'), { recursive: true });
    mockFindRepoRoot.mockResolvedValue(TMP_DIR);
    mockCheckClaude.mockResolvedValue(true);
    mockScanRepo.mockResolvedValue({
      repoRoot: TMP_DIR,
      claudeMdPath: null,
      claudeMdContent: null,
      contextDir: null,
      contextFiles: [],
      config: {} as any,
    });
    mockGatherSource.mockResolvedValue({ content: 'some git diff content', label: 'git diff' });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    await rm(TMP_DIR, { recursive: true, force: true });
    logSpy.mockRestore();
    errorSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('sets exitCode 3 when Claude not installed', async () => {
    mockCheckClaude.mockResolvedValue(false);

    await learn({});

    expect(process.exitCode).toBe(3);
    expect(errorSpy).toHaveBeenCalled();
    const errorMsg = errorSpy.mock.calls[0]?.[0] as string;
    expect(errorMsg).toContain('Claude CLI not found');
  });

  it('sets exitCode 3 with JSON output when Claude not installed', async () => {
    mockCheckClaude.mockResolvedValue(false);

    await learn({ json: true });

    expect(process.exitCode).toBe(3);
    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output.status).toBe('error');
    expect(output.message).toContain('Claude CLI not found');
  });

  it('dry run shows prompt without running Claude', async () => {
    await learn({ dryRun: true });

    expect(mockRun).not.toHaveBeenCalled();
    const allOutput = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('Source content gathered');
    expect(allOutput).toContain('Prompt that would be sent to Claude');
  });

  it('dry run JSON mode returns prompt metadata', async () => {
    await learn({ dryRun: true, json: true });

    expect(mockRun).not.toHaveBeenCalled();
    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output.status).toBe('dry_run');
    expect(output.prompt).toBeDefined();
    expect(output.sourceLength).toBeDefined();
  });

  it('runs Claude with git diff as default source', async () => {
    mockRun.mockResolvedValue({
      output: JSON.stringify({
        action: 'create',
        targetFile: '.claude/context/patterns.md',
        content: 'new content',
        overlap: [],
      }),
      exitCode: 0,
      duration: 5000,
    });

    await learn({});

    expect(mockGatherSource).toHaveBeenCalledWith(
      expect.objectContaining({}),
      TMP_DIR,
    );
    expect(mockRun).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: TMP_DIR,
        timeout: 300_000,
      }),
    );
  });

  it('passes file option through to gatherSource', async () => {
    mockRun.mockResolvedValue({
      output: JSON.stringify({
        action: 'create',
        targetFile: 'new.md',
        content: '',
        overlap: [],
      }),
      exitCode: 0,
      duration: 1000,
    });

    await learn({ file: 'notes.md' });

    expect(mockGatherSource).toHaveBeenCalledWith(
      expect.objectContaining({ file: 'notes.md' }),
      TMP_DIR,
    );
  });

  it('passes session ID through to gatherSource', async () => {
    mockRun.mockResolvedValue({
      output: JSON.stringify({
        action: 'create',
        targetFile: 'new.md',
        content: '',
        overlap: [],
      }),
      exitCode: 0,
      duration: 1000,
    });

    await learn({ session: 'sess-abc' });

    expect(mockGatherSource).toHaveBeenCalledWith(
      expect.objectContaining({ session: 'sess-abc' }),
      TMP_DIR,
    );
  });

  it('passes prompt through to gatherSource', async () => {
    mockRun.mockResolvedValue({
      output: JSON.stringify({
        action: 'create',
        targetFile: 'new.md',
        content: '',
        overlap: [],
      }),
      exitCode: 0,
      duration: 1000,
    });

    await learn({ prompt: 'extract the auth pattern' });

    expect(mockGatherSource).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'extract the auth pattern' }),
      TMP_DIR,
    );
  });

  it('passes url through to gatherSource', async () => {
    mockRun.mockResolvedValue({
      output: JSON.stringify({
        action: 'create',
        targetFile: 'new.md',
        content: '',
        overlap: [],
      }),
      exitCode: 0,
      duration: 1000,
    });

    await learn({ url: 'https://example.com/doc.md' });

    expect(mockGatherSource).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com/doc.md' }),
      TMP_DIR,
    );
  });

  it('includes merge instruction when --merge specified', async () => {
    mockRun.mockResolvedValue({
      output: JSON.stringify({
        action: 'merge',
        targetFile: 'style.md',
        content: 'merged',
        overlap: [],
      }),
      exitCode: 0,
      duration: 2000,
    });

    await learn({ merge: 'style.md' });

    const promptArg = mockRun.mock.calls[0][0].prompt;
    expect(promptArg).toContain('MUST merge');
    expect(promptArg).toContain('style.md');
  });

  it('includes existing context info in prompt', async () => {
    mockScanRepo.mockResolvedValue({
      repoRoot: TMP_DIR,
      claudeMdPath: join(TMP_DIR, 'CLAUDE.md'),
      claudeMdContent: '# Project',
      contextDir: join(TMP_DIR, '.claude-context'),
      contextFiles: [
        {
          path: '.claude-context/arch.md',
          absolutePath: join(TMP_DIR, '.claude-context/arch.md'),
          content: 'Architecture content here that is quite long',
          tokens: 200,
          frontmatter: { name: 'Architecture', description: 'Arch patterns' },
        },
      ],
      config: {} as any,
    });

    mockRun.mockResolvedValue({
      output: JSON.stringify({
        action: 'create',
        targetFile: 'new.md',
        content: '',
        overlap: [],
      }),
      exitCode: 0,
      duration: 1000,
    });

    await learn({});

    const promptArg = mockRun.mock.calls[0][0].prompt;
    expect(promptArg).toContain('Existing context files');
    expect(promptArg).toContain('.claude-context/arch.md');
    expect(promptArg).toContain('200 tokens');
    expect(promptArg).toContain('Architecture');
  });

  it('parses JSON response from Claude and outputs result', async () => {
    mockRun.mockResolvedValue({
      output: JSON.stringify({
        action: 'create',
        targetFile: '.claude/context/testing.md',
        content: 'test content',
        overlap: [{ file: 'arch.md', similarity: 0.4 }],
        claudeMdUpdate: 'updated',
      }),
      exitCode: 0,
      duration: 3500,
    });

    await learn({});

    const allOutput = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('.claude/context/testing.md');
    expect(allOutput).toContain('Overlap detected');
    expect(allOutput).toContain('arch.md');
    expect(allOutput).toContain('40%');
    expect(allOutput).toContain('CLAUDE.md will be updated');
    expect(allOutput).toContain('3.5s');
    expect(allOutput).toContain('cdd curate');
  });

  it('JSON output mode for successful run', async () => {
    mockRun.mockResolvedValue({
      output: JSON.stringify({
        action: 'create',
        targetFile: 'new.md',
        content: 'content',
        overlap: [],
      }),
      exitCode: 0,
      duration: 2000,
    });

    await learn({ json: true });

    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output.status).toBe('completed');
    expect(output.duration).toBe(2000);
    expect(output.action).toBe('create');
    expect(output.targetFile).toBe('new.md');
  });

  it('handles Claude error gracefully', async () => {
    const RunnerError = ClaudeRunnerError as unknown as new (
      msg: string,
      code: number,
      stderr: string,
    ) => Error & { exitCode: number; stderr: string };
    mockRun.mockRejectedValue(new RunnerError('Claude failed', 1, 'stderr output'));

    await learn({});

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalled();
    const errorMsg = errorSpy.mock.calls[0]?.[0] as string;
    expect(errorMsg).toContain('Claude failed');
  });

  it('handles Claude error with JSON output', async () => {
    const RunnerError = ClaudeRunnerError as unknown as new (
      msg: string,
      code: number,
      stderr: string,
    ) => Error & { exitCode: number; stderr: string };
    mockRun.mockRejectedValue(new RunnerError('Claude failed', 1, ''));

    await learn({ json: true });

    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output.status).toBe('error');
    expect(output.message).toBe('Claude failed');
    expect(output.exitCode).toBe(1);
  });

  it('sets exitCode 1 when not in a git repo', async () => {
    mockFindRepoRoot.mockRejectedValue(new Error('Not inside a git repository'));

    await learn({});

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('sets exitCode 1 when source gathering fails', async () => {
    mockGatherSource.mockRejectedValue(new Error('Cannot read file "missing.md"'));

    await learn({ file: 'missing.md' });

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalled();
    const errorMsg = errorSpy.mock.calls[0]?.[0] as string;
    expect(errorMsg).toContain('Cannot read file');
  });

  it('aborts when user declines confirmation', async () => {
    mockRun.mockResolvedValue({
      output: JSON.stringify({
        action: 'create',
        targetFile: '.claude/context/new.md',
        content: 'new content',
        overlap: [],
      }),
      exitCode: 0,
      duration: 1000,
    });
    mockConfirm.mockResolvedValueOnce(false);

    await learn({});

    const allOutput = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('Aborted');
  });
});
