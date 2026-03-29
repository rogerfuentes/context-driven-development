import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  scanLegacyDirs,
  inferFrontmatter,
} from '../../src/utils/migrator.js';

let testDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), `cdd-migrator-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe('scanLegacyDirs', () => {
  it('finds files in well-known legacy dirs', async () => {
    await mkdir(join(testDir, '.claude/docs'), { recursive: true });
    await mkdir(join(testDir, '.claude/patterns'), { recursive: true });
    await writeFile(join(testDir, '.claude/docs/architecture.md'), '# Architecture\nService map.');
    await writeFile(join(testDir, '.claude/patterns/temporal.md'), '# Temporal\nDeterminism rules.');

    const files = await scanLegacyDirs(testDir, null, null);
    expect(files).toHaveLength(2);
    expect(files.map((f) => f.filename).sort()).toEqual(['architecture.md', 'temporal.md']);
  });

  it('discovers dirs from CLAUDE.md references', async () => {
    await mkdir(join(testDir, 'docs/guides'), { recursive: true });
    await writeFile(join(testDir, 'docs/guides/setup.md'), '# Setup\nLocal dev.');
    const claudeMd = 'See `docs/guides/setup.md` for setup instructions.';

    const files = await scanLegacyDirs(testDir, claudeMd, null);
    expect(files.some((f) => f.relativePath === 'docs/guides/setup.md')).toBe(true);
  });

  it('excludes the context directory', async () => {
    await mkdir(join(testDir, '.claude/context'), { recursive: true });
    await mkdir(join(testDir, '.claude/docs'), { recursive: true });
    await writeFile(join(testDir, '.claude/context/arch.md'), '# Arch');
    await writeFile(join(testDir, '.claude/docs/arch.md'), '# Arch');
    const claudeMd = 'See `.claude/context/arch.md` and `.claude/docs/arch.md`.';

    const files = await scanLegacyDirs(testDir, claudeMd, join(testDir, '.claude/context'));
    expect(files.every((f) => !f.relativePath.startsWith('.claude/context/'))).toBe(true);
    expect(files.some((f) => f.relativePath === '.claude/docs/arch.md')).toBe(true);
  });

  it('returns empty when no legacy dirs exist', async () => {
    const files = await scanLegacyDirs(testDir, null, null);
    expect(files).toHaveLength(0);
  });

  it('skips empty files', async () => {
    await mkdir(join(testDir, '.claude/docs'), { recursive: true });
    await writeFile(join(testDir, '.claude/docs/empty.md'), '');
    await writeFile(join(testDir, '.claude/docs/real.md'), '# Real\nContent.');

    const files = await scanLegacyDirs(testDir, null, null);
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('real.md');
  });

  it('excludes temporal/planning docs from docs/', async () => {
    await mkdir(join(testDir, 'docs/plans'), { recursive: true });
    await mkdir(join(testDir, 'docs/spikes'), { recursive: true });
    await mkdir(join(testDir, 'docs/tech-plans'), { recursive: true });
    await writeFile(join(testDir, 'docs/plans/migration.md'), '# Migration Plan\nPhase 1.');
    await writeFile(join(testDir, 'docs/spikes/assessment.md'), '# Spike\nInvestigation.');
    await writeFile(join(testDir, 'docs/tech-plans/design.md'), '# Tech Plan\nDesign.');
    await writeFile(join(testDir, 'docs/cost-analysis.md'), '# Cost Analysis\nPer message costs.');

    const files = await scanLegacyDirs(testDir, null, null);
    // Only the non-temporal file should be included
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('cost-analysis.md');
  });

  it('excludes temporal docs referenced from CLAUDE.md', async () => {
    await mkdir(join(testDir, 'docs/rfcs'), { recursive: true });
    await writeFile(join(testDir, 'docs/rfcs/proposal.md'), '# RFC\nProposal details.');
    const claudeMd = 'See `docs/rfcs/proposal.md` for the original RFC.';

    const files = await scanLegacyDirs(testDir, claudeMd, null);
    expect(files.every((f) => !f.relativePath.includes('rfcs'))).toBe(true);
  });

  it('rejects paths that escape repo root', async () => {
    const claudeMd = 'See `../../etc/passwd.md` for secrets.';
    const files = await scanLegacyDirs(testDir, claudeMd, null);
    expect(files.every((f) => !f.relativePath.includes('etc/passwd'))).toBe(true);
  });

  it('includes token count for each file', async () => {
    await mkdir(join(testDir, '.claude/docs'), { recursive: true });
    await writeFile(join(testDir, '.claude/docs/big.md'), 'x'.repeat(8000));

    const files = await scanLegacyDirs(testDir, null, null);
    expect(files[0].tokens).toBe(2000); // 8000 / 4
  });
});

describe('inferFrontmatter', () => {
  it('extracts name from H1 heading', () => {
    const result = inferFrontmatter('# My Architecture\nSome content here.', 'arch.md');
    expect(result.name).toBe('My Architecture');
    expect(result.description).toBe('Some content here.');
  });

  it('title-cases filename when no H1', () => {
    const result = inferFrontmatter('Just some content.', 'code-style.md');
    expect(result.name).toBe('Code Style');
  });

  it('preserves existing frontmatter fields', () => {
    const content = '---\nname: Custom Name\ndescription: Custom desc\ntags: [a, b]\n---\n\n# Heading\nBody.';
    const result = inferFrontmatter(content, 'file.md');
    expect(result.name).toBe('Custom Name');
    expect(result.description).toBe('Custom desc');
    expect(result.existingFields).toHaveProperty('tags');
  });

  it('merges partial frontmatter without losing fields', () => {
    const content = '---\nname: My Name\ntags: [x]\n---\n\nFirst paragraph here.';
    const result = inferFrontmatter(content, 'file.md');
    expect(result.name).toBe('My Name');
    expect(result.description).toBe('First paragraph here.');
    expect(result.existingFields).toHaveProperty('tags');
    expect(result.existingFields).toHaveProperty('name');
  });

  it('collects full paragraph for description', () => {
    const content = '# Title\n\nThis is the first\nline of a paragraph.';
    const result = inferFrontmatter(content, 'file.md');
    expect(result.description).toBe('This is the first line of a paragraph.');
  });

  it('truncates long descriptions to 120 chars', () => {
    const longLine = 'A'.repeat(200);
    const result = inferFrontmatter(`# Title\n${longLine}`, 'file.md');
    expect(result.description).toHaveLength(120);
  });
});
