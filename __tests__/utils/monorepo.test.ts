import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { detectMonorepo, enumeratePackages } from '../../src/utils/monorepo.js';

const TMP_DIR = join(process.cwd(), '__tests__', '.tmp-monorepo');

describe('detectMonorepo', () => {
  beforeEach(async () => {
    await mkdir(TMP_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TMP_DIR, { recursive: true, force: true });
  });

  it('detects pnpm-workspace.yaml', async () => {
    await writeFile(join(TMP_DIR, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n  - "apps/*"\n');

    const result = await detectMonorepo(TMP_DIR);
    expect(result.isMonorepo).toBe(true);
    expect(result.workspaceGlobs).toEqual(['packages/*', 'apps/*']);
  });

  it('detects package.json workspaces array', async () => {
    await writeFile(join(TMP_DIR, 'package.json'), JSON.stringify({
      name: 'root',
      workspaces: ['packages/*'],
    }));

    const result = await detectMonorepo(TMP_DIR);
    expect(result.isMonorepo).toBe(true);
    expect(result.workspaceGlobs).toEqual(['packages/*']);
  });

  it('detects package.json workspaces.packages', async () => {
    await writeFile(join(TMP_DIR, 'package.json'), JSON.stringify({
      name: 'root',
      workspaces: { packages: ['libs/*'] },
    }));

    const result = await detectMonorepo(TMP_DIR);
    expect(result.isMonorepo).toBe(true);
    expect(result.workspaceGlobs).toEqual(['libs/*']);
  });

  it('detects lerna.json', async () => {
    await writeFile(join(TMP_DIR, 'lerna.json'), JSON.stringify({
      packages: ['modules/*'],
    }));

    const result = await detectMonorepo(TMP_DIR);
    expect(result.isMonorepo).toBe(true);
    expect(result.workspaceGlobs).toEqual(['modules/*']);
  });

  it('returns false for non-monorepo', async () => {
    await writeFile(join(TMP_DIR, 'package.json'), JSON.stringify({ name: 'single' }));

    const result = await detectMonorepo(TMP_DIR);
    expect(result.isMonorepo).toBe(false);
    expect(result.workspaceGlobs).toEqual([]);
  });

  it('returns false for empty directory', async () => {
    const result = await detectMonorepo(TMP_DIR);
    expect(result.isMonorepo).toBe(false);
  });
});

describe('enumeratePackages', () => {
  beforeEach(async () => {
    await mkdir(TMP_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TMP_DIR, { recursive: true, force: true });
  });

  it('enumerates packages from globs', async () => {
    // Create packages/foo and packages/bar
    await mkdir(join(TMP_DIR, 'packages', 'foo'), { recursive: true });
    await writeFile(join(TMP_DIR, 'packages', 'foo', 'package.json'), JSON.stringify({ name: '@org/foo' }));

    await mkdir(join(TMP_DIR, 'packages', 'bar'), { recursive: true });
    await writeFile(join(TMP_DIR, 'packages', 'bar', 'package.json'), JSON.stringify({ name: '@org/bar' }));

    const packages = await enumeratePackages(TMP_DIR, ['packages/*']);
    expect(packages).toHaveLength(2);
    expect(packages.map((p) => p.name).sort()).toEqual(['@org/bar', '@org/foo']);
    expect(packages[0].hasClaudeMd).toBe(false);
    expect(packages[0].hasContextDir).toBe(false);
  });

  it('detects existing CLAUDE.md', async () => {
    await mkdir(join(TMP_DIR, 'packages', 'foo'), { recursive: true });
    await writeFile(join(TMP_DIR, 'packages', 'foo', 'package.json'), JSON.stringify({ name: 'foo' }));
    await writeFile(join(TMP_DIR, 'packages', 'foo', 'CLAUDE.md'), '# Foo');

    const packages = await enumeratePackages(TMP_DIR, ['packages/*']);
    expect(packages[0].hasClaudeMd).toBe(true);
  });

  it('detects existing context directory', async () => {
    await mkdir(join(TMP_DIR, 'packages', 'foo', '.claude', 'context'), { recursive: true });
    await writeFile(join(TMP_DIR, 'packages', 'foo', 'package.json'), JSON.stringify({ name: 'foo' }));

    const packages = await enumeratePackages(TMP_DIR, ['packages/*']);
    expect(packages[0].hasContextDir).toBe(true);
  });

  it('handles multiple glob patterns', async () => {
    await mkdir(join(TMP_DIR, 'packages', 'lib'), { recursive: true });
    await writeFile(join(TMP_DIR, 'packages', 'lib', 'package.json'), JSON.stringify({ name: 'lib' }));

    await mkdir(join(TMP_DIR, 'apps', 'web'), { recursive: true });
    await writeFile(join(TMP_DIR, 'apps', 'web', 'package.json'), JSON.stringify({ name: 'web' }));

    const packages = await enumeratePackages(TMP_DIR, ['packages/*', 'apps/*']);
    expect(packages).toHaveLength(2);
  });

  it('returns empty for no matches', async () => {
    const packages = await enumeratePackages(TMP_DIR, ['packages/*']);
    expect(packages).toEqual([]);
  });

  it('skips directories without package.json', async () => {
    await mkdir(join(TMP_DIR, 'packages', 'no-pkg'), { recursive: true });
    await writeFile(join(TMP_DIR, 'packages', 'no-pkg', 'README.md'), 'hello');

    const packages = await enumeratePackages(TMP_DIR, ['packages/*']);
    expect(packages).toEqual([]);
  });
});
