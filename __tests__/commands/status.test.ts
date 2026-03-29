import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { status } from '../../src/commands/status.js';

const TMP_DIR = join(import.meta.dirname, '.tmp-status');

describe('status command', () => {
  beforeAll(async () => {
    await mkdir(TMP_DIR, { recursive: true });
    execSync('git init', { cwd: TMP_DIR, stdio: 'ignore' });
  });

  afterAll(async () => {
    await rm(TMP_DIR, { recursive: true, force: true });
  });

  it('handles no specs directory gracefully', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    await status({ json: false });

    console.log = origLog;
    const output = logs.join('\n');
    expect(output).toContain('No specs found');
  });

  it('finds and reports spec progress', async () => {
    const specDir = join(TMP_DIR, '.claude', 'specs', 'test-feature');
    await mkdir(specDir, { recursive: true });
    await writeFile(join(specDir, 'plan.md'), `# Plan
- [x] Step 1: Setup
- [x] Step 2: Implement
- [ ] Step 3: Test
- [ ] Step 4: Review
`);
    await writeFile(join(specDir, 'analysis.md'), '# Analysis\nSome analysis');

    const logs: string[] = [];
    const origLog = console.log;
    const origCwd = process.cwd();
    process.chdir(TMP_DIR);
    console.log = (msg: string) => logs.push(msg);

    await status({ json: false });

    console.log = origLog;
    process.chdir(origCwd);
    const output = logs.join('\n');
    expect(output).toContain('test-feature');
    expect(output).toContain('2/4');
  });

  it('outputs valid JSON with --json flag', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    const origCwd = process.cwd();
    process.chdir(TMP_DIR);
    console.log = (msg: string) => logs.push(msg);

    await status({ json: true });

    console.log = origLog;
    process.chdir(origCwd);
    const parsed = JSON.parse(logs.join(''));
    expect(parsed.specs).toBeDefined();
    expect(Array.isArray(parsed.specs)).toBe(true);
    expect(parsed.overall).toBeDefined();
    expect(typeof parsed.overall.percentage).toBe('number');
  });

  it('scans custom specs dir with --specs-dir', async () => {
    const customDir = join(TMP_DIR, 'custom-specs', 'another-feature');
    await mkdir(customDir, { recursive: true });
    await writeFile(join(customDir, 'plan.md'), '- [x] Done\n- [x] Also done\n');

    const logs: string[] = [];
    const origLog = console.log;
    const origCwd = process.cwd();
    process.chdir(TMP_DIR);
    console.log = (msg: string) => logs.push(msg);

    await status({ json: false, specsDir: 'custom-specs' });

    console.log = origLog;
    process.chdir(origCwd);
    const output = logs.join('\n');
    expect(output).toContain('another-feature');
    expect(output).toContain('permanent');
  });
});
