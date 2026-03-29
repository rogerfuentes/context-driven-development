import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { conflictDetect } from '../../src/commands/conflict-detect.js';

const TMP_DIR = join(import.meta.dirname, '.tmp-conflict-detect');

describe('conflict-detect command', () => {
  beforeAll(async () => {
    await mkdir(TMP_DIR, { recursive: true });
    execSync('git init', { cwd: TMP_DIR, stdio: 'ignore' });
  });

  afterAll(async () => {
    await rm(TMP_DIR, { recursive: true, force: true });
  });

  it('detects file conflicts between streams', async () => {
    const specDir = join(TMP_DIR, '.claude', 'specs', 'conflict-spec');
    await mkdir(specDir, { recursive: true });
    await writeFile(join(specDir, 'plan.md'), `# Plan
### Can parallelize?
Yes

### Parallel Streams
| Stream | Steps | Files | Dependencies |
|--------|-------|-------|--------------|
| api | 1, 2 | src/types.ts, src/api.ts | none |
| ui | 3, 4 | src/types.ts, src/ui.tsx | none |
`);

    const logs: string[] = [];
    const origLog = console.log;
    const origCwd = process.cwd();
    process.chdir(TMP_DIR);
    console.log = (msg: string) => logs.push(msg);

    await conflictDetect('conflict-spec', { json: false });

    console.log = origLog;
    process.chdir(origCwd);
    const output = logs.join('\n');
    expect(output).toContain('CONFLICTS');
    expect(output).toContain('src/types.ts');
    expect(output).toContain('Lead must own');
    expect(output).toContain('Safe files');
    expect(output).toContain('src/api.ts');
    expect(output).toContain('src/ui.tsx');
  });

  it('reports no conflicts when streams are independent', async () => {
    const specDir = join(TMP_DIR, '.claude', 'specs', 'clean-spec');
    await mkdir(specDir, { recursive: true });
    await writeFile(join(specDir, 'plan.md'), `# Plan
### Can parallelize?
Yes

### Parallel Streams
| Stream | Steps | Files | Dependencies |
|--------|-------|-------|--------------|
| api | 1 | src/api.ts | none |
| ui | 2 | src/ui.tsx | none |
`);

    const logs: string[] = [];
    const origLog = console.log;
    const origCwd = process.cwd();
    process.chdir(TMP_DIR);
    console.log = (msg: string) => logs.push(msg);

    await conflictDetect('clean-spec', { json: false });

    console.log = origLog;
    process.chdir(origCwd);
    const output = logs.join('\n');
    expect(output).toContain('No conflicts detected');
  });

  it('outputs valid JSON with --json flag', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    const origCwd = process.cwd();
    process.chdir(TMP_DIR);
    console.log = (msg: string) => logs.push(msg);

    await conflictDetect('conflict-spec', { json: true });

    console.log = origLog;
    process.chdir(origCwd);
    const parsed = JSON.parse(logs.join(''));
    expect(parsed.hasConflicts).toBe(true);
    expect(parsed.conflicts).toHaveLength(1);
    expect(parsed.conflicts[0].filePath).toBe('src/types.ts');
    expect(parsed.conflicts[0].streams).toContain('api');
    expect(parsed.conflicts[0].streams).toContain('ui');
  });

  it('reports error for missing spec', async () => {
    const logs: string[] = [];
    const origErr = console.error;
    const origCwd = process.cwd();
    process.chdir(TMP_DIR);
    console.error = (msg: string) => logs.push(msg);

    await conflictDetect('nonexistent', { json: false });

    console.error = origErr;
    process.chdir(origCwd);
    expect(logs.join('')).toContain('Spec not found');
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });

  it('handles non-parallelizable spec', async () => {
    const specDir = join(TMP_DIR, '.claude', 'specs', 'no-parallel');
    await mkdir(specDir, { recursive: true });
    await writeFile(join(specDir, 'plan.md'), `# Plan\n### Can parallelize?\nNo\n`);

    const logs: string[] = [];
    const origLog = console.log;
    const origCwd = process.cwd();
    process.chdir(TMP_DIR);
    console.log = (msg: string) => logs.push(msg);

    await conflictDetect('no-parallel', { json: false });

    console.log = origLog;
    process.chdir(origCwd);
    expect(logs.join('')).toContain('Not parallelizable');
  });
});
