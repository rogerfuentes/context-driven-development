import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findRepoRoot } from '../../src/utils/git.js';

describe('findRepoRoot', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cdd-test-git-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('finds repo root when .git/ exists in current directory', async () => {
    await mkdir(join(tempDir, '.git'));

    const root = await findRepoRoot(tempDir);
    expect(root).toBe(tempDir);
  });

  it('finds repo root when .git/ exists in parent directory', async () => {
    await mkdir(join(tempDir, '.git'));
    const nested = join(tempDir, 'src', 'commands');
    await mkdir(nested, { recursive: true });

    const root = await findRepoRoot(nested);
    expect(root).toBe(tempDir);
  });

  it('finds repo root when .git/ exists two levels up', async () => {
    await mkdir(join(tempDir, '.git'));
    const deepNested = join(tempDir, 'packages', 'foo', 'src');
    await mkdir(deepNested, { recursive: true });

    const root = await findRepoRoot(deepNested);
    expect(root).toBe(tempDir);
  });

  it('throws when not in a git repo', async () => {
    // tempDir has no .git directory
    await expect(findRepoRoot(tempDir)).rejects.toThrow('Not inside a git repository');
  });
});
