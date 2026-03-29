import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
  AbortError: class AbortError extends Error { override name = 'AbortError'; },
}));

import { execa } from 'execa';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { run, runAgent, checkClaudeInstalled, resetInstallCache, ClaudeRunnerError } from '../../src/claude/runner.js';

const mockExeca = vi.mocked(execa);
const mockQuery = vi.mocked(query);

describe('ClaudeRunner', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetInstallCache();
  });

  describe('checkClaudeInstalled', () => {
    it('returns true when claude --version succeeds', async () => {
      mockExeca.mockResolvedValueOnce({ exitCode: 0, stdout: '1.0.0', stderr: '' } as any);

      const result = await checkClaudeInstalled();
      expect(result).toBe(true);
      expect(mockExeca).toHaveBeenCalledWith('claude', ['--version'], { timeout: 10_000 });
    });

    it('returns false when claude --version fails', async () => {
      mockExeca.mockRejectedValueOnce(new Error('not found'));

      const result = await checkClaudeInstalled();
      expect(result).toBe(false);
    });

    it('caches the result across calls', async () => {
      mockExeca.mockResolvedValueOnce({ exitCode: 0, stdout: '1.0.0', stderr: '' } as any);

      await checkClaudeInstalled();
      await checkClaudeInstalled();

      // Only called once due to caching
      expect(mockExeca).toHaveBeenCalledTimes(1);
    });

    it('uses custom claude path', async () => {
      mockExeca.mockResolvedValueOnce({ exitCode: 0, stdout: '1.0.0', stderr: '' } as any);

      await checkClaudeInstalled('/usr/local/bin/claude');
      expect(mockExeca).toHaveBeenCalledWith('/usr/local/bin/claude', ['--version'], { timeout: 10_000 });
    });

    it('does not reuse cache across different claude paths', async () => {
      mockExeca.mockResolvedValueOnce({ exitCode: 0, stdout: '1.0.0', stderr: '' } as any);
      await expect(checkClaudeInstalled('claude')).resolves.toBe(true);

      mockExeca.mockRejectedValueOnce(new Error('not found'));
      await expect(checkClaudeInstalled('/bad/path/claude')).resolves.toBe(false);

      expect(mockExeca).toHaveBeenCalledTimes(2);
    });
  });

  describe('run', () => {
    // Helper to set up claude as installed
    function mockClaudeInstalled() {
      mockExeca.mockResolvedValueOnce({ exitCode: 0, stdout: '1.0.0', stderr: '' } as any);
    }

    it('returns output and duration on success', async () => {
      mockClaudeInstalled();
      mockExeca.mockResolvedValueOnce({
        exitCode: 0,
        stdout: '{"files": []}',
        stderr: '',
      } as any);

      const result = await run({ prompt: 'test prompt' });

      expect(result.output).toBe('{"files": []}');
      expect(result.exitCode).toBe(0);
      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('passes prompt via input option', async () => {
      mockClaudeInstalled();
      mockExeca.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
      } as any);

      await run({ prompt: 'my prompt text' });

      // Second call is the actual run (first is version check)
      const callArgs = mockExeca.mock.calls[1];
      expect(callArgs[0]).toBe('claude');
      expect(callArgs[1]).toEqual(['-p', '--output-format', 'text']);
      expect(callArgs[2]).toMatchObject({ input: 'my prompt text' });
    });

    it('passes cwd to execa', async () => {
      mockClaudeInstalled();
      mockExeca.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
      } as any);

      await run({ prompt: 'test', cwd: '/my/repo' });

      const callArgs = mockExeca.mock.calls[1];
      expect(callArgs[2]).toMatchObject({ cwd: '/my/repo' });
    });

    it('passes timeout to execa', async () => {
      mockClaudeInstalled();
      mockExeca.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
      } as any);

      await run({ prompt: 'test', timeout: 60_000 });

      const callArgs = mockExeca.mock.calls[1];
      expect(callArgs[2]).toMatchObject({ timeout: 60_000 });
    });

    it('uses default timeout of 300000ms', async () => {
      mockClaudeInstalled();
      mockExeca.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
      } as any);

      await run({ prompt: 'test' });

      const callArgs = mockExeca.mock.calls[1];
      expect(callArgs[2]).toMatchObject({ timeout: 300_000 });
    });

    it('throws ClaudeRunnerError on non-zero exit', async () => {
      mockClaudeInstalled();
      mockExeca.mockResolvedValueOnce({
        exitCode: 1,
        stdout: '',
        stderr: 'Something went wrong',
      } as any);

      await expect(run({ prompt: 'test' })).rejects.toThrow(ClaudeRunnerError);

      try {
        await run({ prompt: 'test' });
      } catch (e) {
        // Need a fresh call since the cache is set
        // Actually the first call already threw, let's check the first throw
      }

      // Verify the error properties from the first throw
      try {
        resetInstallCache();
        mockExeca.mockResolvedValueOnce({ exitCode: 0, stdout: '1.0.0', stderr: '' } as any);
        mockExeca.mockResolvedValueOnce({
          exitCode: 2,
          stdout: '',
          stderr: 'bad input',
        } as any);
        await run({ prompt: 'test' });
      } catch (e) {
        const err = e as ClaudeRunnerError;
        expect(err).toBeInstanceOf(ClaudeRunnerError);
        expect(err.exitCode).toBe(2);
        expect(err.stderr).toBe('bad input');
      }
    });

    it('throws ClaudeRunnerError on timeout', async () => {
      mockClaudeInstalled();
      mockExeca.mockResolvedValueOnce({
        timedOut: true,
        exitCode: undefined,
        stdout: '',
        stderr: '',
      } as any);

      await expect(run({ prompt: 'test', timeout: 1000 })).rejects.toThrow(ClaudeRunnerError);

      // Verify message mentions timeout
      resetInstallCache();
      mockExeca.mockResolvedValueOnce({ exitCode: 0, stdout: '1.0.0', stderr: '' } as any);
      mockExeca.mockResolvedValueOnce({
        timedOut: true,
        exitCode: undefined,
        stdout: '',
        stderr: '',
      } as any);

      try {
        await run({ prompt: 'test', timeout: 5000 });
      } catch (e) {
        const err = e as ClaudeRunnerError;
        expect(err.message).toContain('timed out');
        expect(err.message).toContain('5000');
      }
    });

    it('throws ClaudeRunnerError when claude is not installed', async () => {
      mockExeca.mockRejectedValueOnce(new Error('not found'));

      try {
        await run({ prompt: 'test' });
        expect.fail('should have thrown');
      } catch (e) {
        const err = e as ClaudeRunnerError;
        expect(err).toBeInstanceOf(ClaudeRunnerError);
        expect(err.exitCode).toBe(3);
        expect(err.message).toContain('Claude CLI not found');
        expect(err.message).toContain('https://claude.ai/code');
      }
    });

    it('logs command in verbose mode', async () => {
      mockClaudeInstalled();
      mockExeca.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
      } as any);

      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await run({ prompt: 'test', verbose: true, cwd: '/my/repo' });

      expect(spy).toHaveBeenCalledTimes(1);
      const loggedMessage = spy.mock.calls[0][0] as string;
      // The message contains ANSI codes from picocolors, so check for key substrings
      expect(loggedMessage).toContain('claude');
      expect(loggedMessage).toContain('/my/repo');

      spy.mockRestore();
    });

    it('does not log command when verbose is false', async () => {
      mockClaudeInstalled();
      mockExeca.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
      } as any);

      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await run({ prompt: 'test', verbose: false });

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('forwards permissionMode to claude args', async () => {
      mockClaudeInstalled();
      mockExeca.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
      } as any);

      await run({ prompt: 'test', permissionMode: 'plan' });

      const callArgs = mockExeca.mock.calls[1];
      expect(callArgs[1]).toContain('--permission-mode');
      expect(callArgs[1]).toContain('plan');
    });

    it('forwards allowedTools to claude args', async () => {
      mockClaudeInstalled();
      mockExeca.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
      } as any);

      await run({ prompt: 'test', allowedTools: ['Read', 'Grep', 'Glob'] });

      const callArgs = mockExeca.mock.calls[1];
      expect(callArgs[1]).toContain('--allowedTools');
      expect(callArgs[1]).toContain('Read');
      expect(callArgs[1]).toContain('Grep');
      expect(callArgs[1]).toContain('Glob');
    });

    it('does not include permissionMode or allowedTools when not specified', async () => {
      mockClaudeInstalled();
      mockExeca.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
      } as any);

      await run({ prompt: 'test' });

      const callArgs = mockExeca.mock.calls[1];
      expect(callArgs[1]).not.toContain('--permission-mode');
      expect(callArgs[1]).not.toContain('--allowedTools');
    });

    it('uses custom claudePath', async () => {
      // Reset and set up with custom path
      mockExeca.mockResolvedValueOnce({ exitCode: 0, stdout: '1.0.0', stderr: '' } as any);
      mockExeca.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
      } as any);

      await run({ prompt: 'test', claudePath: '/opt/claude' });

      // Version check uses custom path
      expect(mockExeca.mock.calls[0][0]).toBe('/opt/claude');
      // Run uses custom path
      expect(mockExeca.mock.calls[1][0]).toBe('/opt/claude');
    });
  });

  describe('runAgent', () => {
    let originalApiKey: string | undefined;

    beforeEach(() => {
      originalApiKey = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'test-key';
    });

    afterEach(() => {
      if (originalApiKey !== undefined) {
        process.env.ANTHROPIC_API_KEY = originalApiKey;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
    });

    function mockQueryResult(resultText: string) {
      async function* generator() {
        yield { type: 'system', subtype: 'init', session_id: 'test-123' };
        yield {
          type: 'result',
          subtype: 'success',
          result: resultText,
        };
      }
      mockQuery.mockReturnValue(generator() as any);
    }

    it('returns output from SDK result message', async () => {
      mockQueryResult('{"files":[],"projectType":"test","topics":[]}');

      const result = await runAgent({ prompt: 'test prompt' });

      expect(result.output).toBe('{"files":[],"projectType":"test","topics":[]}');
      expect(result.exitCode).toBe(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('falls back to longest assistant text when no result message', async () => {
      async function* generator() {
        yield { type: 'system', subtype: 'init', session_id: 'test-123' };
        yield {
          type: 'assistant',
          message: { content: [{ type: 'text', text: '{"files":[{"path":"CLAUDE.md","action":"created","content":"# Test"}]}' }] },
        };
      }
      mockQuery.mockReturnValue(generator() as any);

      const result = await runAgent({ prompt: 'test' });

      expect(result.output).toContain('"files"');
    });

    it('throws ClaudeRunnerError when ANTHROPIC_API_KEY is missing', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      await expect(runAgent({ prompt: 'test' })).rejects.toThrow(ClaudeRunnerError);

      try {
        await runAgent({ prompt: 'test' });
      } catch (e) {
        const err = e as ClaudeRunnerError;
        expect(err.exitCode).toBe(3);
        expect(err.message).toContain('ANTHROPIC_API_KEY');
      }
    });

    it('passes cwd and model to query options', async () => {
      mockQueryResult('ok');

      await runAgent({ prompt: 'test', cwd: '/my/repo', model: 'claude-haiku-4-5-20251001' });

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.options.cwd).toBe('/my/repo');
      expect(callArgs.options.model).toBe('claude-haiku-4-5-20251001');
      expect(callArgs.options.permissionMode).toBe('bypassPermissions');
    });

    it('uses default model claude-sonnet-4-6', async () => {
      mockQueryResult('ok');

      await runAgent({ prompt: 'test' });

      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.options.model).toBe('claude-sonnet-4-6');
    });

    it('passes systemPrompt when provided', async () => {
      mockQueryResult('ok');

      await runAgent({ prompt: 'test', systemPrompt: 'You are a CDD agent.' });

      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.options.systemPrompt).toEqual({
        type: 'preset',
        preset: 'claude_code',
        append: 'You are a CDD agent.',
      });
    });

    it('throws ClaudeRunnerError on timeout', async () => {
      const { AbortError: MockAbortError } = await import('@anthropic-ai/claude-agent-sdk');

      async function* generator(): AsyncGenerator<never> {
        throw new MockAbortError('aborted');
      }
      mockQuery.mockReturnValue(generator() as any);

      await expect(runAgent({ prompt: 'test', timeout: 100 })).rejects.toThrow(ClaudeRunnerError);

      try {
        mockQuery.mockReturnValue((async function* () { throw new MockAbortError('aborted'); })() as any);
        await runAgent({ prompt: 'test', timeout: 100 });
      } catch (e) {
        const err = e as ClaudeRunnerError;
        expect(err.message).toContain('timed out');
      }
    });
  });
});
