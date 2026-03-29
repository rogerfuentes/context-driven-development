import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { wavePlan } from '../../src/commands/wave-plan.js';

const TMP_DIR = join(import.meta.dirname, '.tmp-wave-plan');

describe('wave-plan command', () => {
  beforeAll(async () => {
    await mkdir(TMP_DIR, { recursive: true });
    execSync('git init', { cwd: TMP_DIR, stdio: 'ignore' });
  });

  afterAll(async () => {
    await rm(TMP_DIR, { recursive: true, force: true });
  });

  it('generates wave plan from parallelizable spec', async () => {
    const specDir = join(TMP_DIR, '.claude', 'specs', 'test-feature');
    await mkdir(specDir, { recursive: true });
    await writeFile(
      join(specDir, 'plan.md'),
      `# Plan
### Can parallelize?
Yes

### Parallel Streams
| Stream | Steps | Files | Dependencies |
|--------|-------|-------|--------------|
| api | 1, 2 | src/api.ts | none |
| ui | 3, 4 | src/ui.tsx | Stream: api |

### Shared Contracts Required
\`\`\`typescript
interface User { id: string }
\`\`\`

### Execution Order
1. Parallel: api
2. Parallel: ui (after api)
`,
    );

    const logs: string[] = [];
    const origLog = console.log;
    const origCwd = process.cwd();
    process.chdir(TMP_DIR);
    console.log = (msg: string) => logs.push(msg);

    await wavePlan('test-feature', { json: false });

    console.log = origLog;
    process.chdir(origCwd);
    const output = logs.join('\n');
    expect(output).toContain('Wave Plan');
    expect(output).toContain('Wave 1');
    expect(output).toContain('api');
    expect(output).toContain('Wave 2');
    expect(output).toContain('ui');
    expect(output).toContain('Foundation');
  });

  it('outputs valid JSON with --json flag', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    const origCwd = process.cwd();
    process.chdir(TMP_DIR);
    console.log = (msg: string) => logs.push(msg);

    await wavePlan('test-feature', { json: true });

    console.log = origLog;
    process.chdir(origCwd);
    const parsed = JSON.parse(logs.join(''));
    expect(parsed.specId).toBe('test-feature');
    expect(parsed.waves).toHaveLength(2);
    expect(parsed.waves[0].streams[0].name).toBe('api');
    expect(parsed.waves[1].streams[0].name).toBe('ui');
    expect(parsed.phase0.sharedContracts).toHaveLength(1);
  });

  it('reports error for missing spec', async () => {
    const logs: string[] = [];
    const origErr = console.error;
    const origCwd = process.cwd();
    process.chdir(TMP_DIR);
    console.error = (msg: string) => logs.push(msg);

    await wavePlan('nonexistent', { json: false });

    console.error = origErr;
    process.chdir(origCwd);
    expect(logs.join('')).toContain('Spec not found');
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });

  it('handles non-parallelizable spec', async () => {
    const specDir = join(TMP_DIR, '.claude', 'specs', 'simple-spec');
    await mkdir(specDir, { recursive: true });
    await writeFile(join(specDir, 'plan.md'), `# Plan\n### Can parallelize?\nNo\n`);

    const logs: string[] = [];
    const origLog = console.log;
    const origCwd = process.cwd();
    process.chdir(TMP_DIR);
    console.log = (msg: string) => logs.push(msg);

    await wavePlan('simple-spec', { json: false });

    console.log = origLog;
    process.chdir(origCwd);
    expect(logs.join('')).toContain('Not parallelizable');
  });

  it('detects dependency cycles', async () => {
    const specDir = join(TMP_DIR, '.claude', 'specs', 'cycle-spec');
    await mkdir(specDir, { recursive: true });
    await writeFile(
      join(specDir, 'plan.md'),
      `# Plan
### Can parallelize?
Yes

### Parallel Streams
| Stream | Steps | Files | Dependencies |
|--------|-------|-------|--------------|
| a | 1 | a.ts | Stream: b |
| b | 2 | b.ts | Stream: a |
`,
    );

    const logs: string[] = [];
    const origErr = console.error;
    const origCwd = process.cwd();
    process.chdir(TMP_DIR);
    console.error = (msg: string) => logs.push(msg);

    await wavePlan('cycle-spec', { json: false });

    console.error = origErr;
    process.chdir(origCwd);
    expect(logs.join('')).toContain('Cycle detected');
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });
});
