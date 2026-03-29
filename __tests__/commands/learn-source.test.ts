import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

vi.mock('tinyglobby', () => ({
  glob: vi.fn().mockResolvedValue([]),
}));

import { execa } from 'execa';
import { glob } from 'tinyglobby';
import { gatherSource } from '../../src/commands/learn-source.js';

const mockExeca = vi.mocked(execa);
const mockGlob = vi.mocked(glob);

const TMP_DIR = join(process.cwd(), '__tests__', '.tmp-learn-source');

describe('gatherSource', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await mkdir(TMP_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TMP_DIR, { recursive: true, force: true });
  });

  it('reads file content when --file is used', async () => {
    await writeFile(join(TMP_DIR, 'notes.md'), '# My session notes\nLearned about X.');

    const result = await gatherSource({ file: 'notes.md' }, TMP_DIR);
    expect(result.content).toContain('File: notes.md');
    expect(result.content).toContain('# My session notes');
    expect(result.content).toContain('Learned about X.');
    expect(result.label).toContain('file');
  });

  it('throws when --file points to missing file', async () => {
    await expect(
      gatherSource({ file: 'missing.md' }, TMP_DIR),
    ).rejects.toThrow('Cannot read file');
  });

  it('returns git diff by default', async () => {
    // Mock staged changes
    mockExeca
      .mockResolvedValueOnce({ stdout: ' file.ts | 2 ++', stderr: '', exitCode: 0 } as any)
      .mockResolvedValueOnce({ stdout: 'diff --git a/file.ts\n+new line', stderr: '', exitCode: 0 } as any)
      // Unstaged: empty
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 } as any)
      // Recent commits
      .mockResolvedValueOnce({ stdout: 'abc1234 feat: add feature', stderr: '', exitCode: 0 } as any)
      .mockResolvedValueOnce({ stdout: ' file.ts | 1 +', stderr: '', exitCode: 0 } as any);

    const result = await gatherSource({}, TMP_DIR);
    expect(result.content).toContain('=== Staged Changes ===');
    expect(result.content).toContain('diff --git a/file.ts');
    expect(result.content).toContain('=== Commit: abc1234 feat: add feature ===');
    expect(result.label).toBe('git diff');
  });

  it('handles clean working directory', async () => {
    // All git commands return empty
    mockExeca
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 } as any) // staged stat
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 } as any) // unstaged stat
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 } as any); // log

    const result = await gatherSource({}, TMP_DIR);
    expect(result.content).toContain('No git changes found');
  });

  it('truncates long diffs to ~10K chars', async () => {
    const longDiff = 'x'.repeat(15_000);
    mockExeca
      .mockResolvedValueOnce({ stdout: ' file.ts | 2 ++', stderr: '', exitCode: 0 } as any)
      .mockResolvedValueOnce({ stdout: longDiff, stderr: '', exitCode: 0 } as any)
      // Unstaged: empty
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 } as any)
      // Log: empty
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 } as any);

    const result = await gatherSource({}, TMP_DIR);
    expect(result.content.length).toBeLessThanOrEqual(10_100);
    expect(result.content).toContain('[...truncated');
  });

  it('appends prompt as focus instruction', async () => {
    mockExeca
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 } as any)
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 } as any)
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 } as any);

    const result = await gatherSource({ prompt: 'extract the auth pattern' }, TMP_DIR);
    expect(result.content).toContain('=== Focus Instruction ===');
    expect(result.content).toContain('extract the auth pattern');
    expect(result.label).toContain('+ prompt');
  });

  it('session option reads JSONL transcript', async () => {
    const sessionId = 'test-session-uuid';
    const sessionContent = [
      JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] } }),
      JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Hi there' }] } }),
    ].join('\n');

    // Mock glob to find the session file
    const sessionFile = join(TMP_DIR, `${sessionId}.jsonl`);
    await writeFile(sessionFile, sessionContent);
    mockGlob.mockResolvedValueOnce([sessionFile]);

    const result = await gatherSource({ session: sessionId }, TMP_DIR);
    expect(result.content).toContain('Claude Code Session');
    expect(result.content).toContain('Hello');
    expect(result.content).toContain('Hi there');
    expect(result.label).toContain('session');
  });

  it('throws when session not found', async () => {
    mockGlob.mockResolvedValueOnce([]);

    await expect(
      gatherSource({ session: 'nonexistent' }, TMP_DIR),
    ).rejects.toThrow('Session "nonexistent" not found');
  });

  it('session takes priority over file', async () => {
    const sessionFile = join(TMP_DIR, 'sess.jsonl');
    await writeFile(sessionFile, JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: 'session msg' }] },
    }));
    mockGlob.mockResolvedValueOnce([sessionFile]);

    const result = await gatherSource({ session: 'sess', file: 'notes.md' }, TMP_DIR);
    expect(result.content).toContain('Claude Code Session');
    expect(result.content).not.toContain('notes.md');
  });

  it('url fetches remote content', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('# Remote content'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await gatherSource({ url: 'https://example.com/doc.md' }, TMP_DIR);
    expect(result.content).toContain('URL: https://example.com/doc.md');
    expect(result.content).toContain('# Remote content');
    expect(result.label).toContain('url');

    vi.unstubAllGlobals();
  });

  it('throws on failed URL fetch', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      gatherSource({ url: 'https://example.com/missing' }, TMP_DIR),
    ).rejects.toThrow('Cannot fetch URL');

    vi.unstubAllGlobals();
  });
});
