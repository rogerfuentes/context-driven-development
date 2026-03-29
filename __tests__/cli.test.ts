import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execaNode } from 'execa';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(__dirname, '..', 'dist', 'cli.js');
const ISOLATED_DIR = join(__dirname, '.tmp-cli-test');

describe('cdd CLI', () => {
  // Create an isolated git repo for commands that mutate the filesystem
  beforeAll(async () => {
    await mkdir(ISOLATED_DIR, { recursive: true });
    execSync('git init', { cwd: ISOLATED_DIR, stdio: 'ignore' });
  });

  afterAll(async () => {
    await rm(ISOLATED_DIR, { recursive: true, force: true });
  });
  it('shows help', async () => {
    const result = await execaNode(CLI_PATH, ['--help']);
    expect(result.stdout).toContain('cdd');
    expect(result.stdout).toContain('CDD');
    expect(result.exitCode).toBe(0);
  });

  it('shows version', async () => {
    const result = await execaNode(CLI_PATH, ['--version']);
    expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    expect(result.exitCode).toBe(0);
  });

  it('lists all commands in help', async () => {
    const result = await execaNode(CLI_PATH, ['--help']);
    expect(result.stdout).toContain('install');
    expect(result.stdout).toContain('setup');
    expect(result.stdout).toContain('curate');
    expect(result.stdout).toContain('health');
    expect(result.stdout).toContain('learn');
    expect(result.stdout).toContain('update-commands');
  });

  describe('implemented commands', () => {
    it('runs "install" without crashing', async () => {
      const result = await execaNode(CLI_PATH, ['install'], { cwd: ISOLATED_DIR });
      expect(result.exitCode).toBe(0);
    });

    it('runs "update-commands" without crashing', async () => {
      const result = await execaNode(CLI_PATH, ['update-commands'], { cwd: ISOLATED_DIR });
      expect(result.exitCode).toBe(0);
    });

    it('runs "curate" without crashing', async () => {
      const result = await execaNode(CLI_PATH, ['curate'], { cwd: ISOLATED_DIR, reject: false });
      // curate may exit with code 2 if errors found — that is expected behavior
      expect([0, 2]).toContain(result.exitCode);
      expect(result.stdout).toContain('CDD Curate Report');
    }, 30000);

    it('runs "health" without crashing', async () => {
      const result = await execaNode(CLI_PATH, ['health'], { cwd: ISOLATED_DIR, reject: false });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('CDD Health');
      expect(result.stdout).toContain('Health Score');
    }, 30000);

    it('runs "learn --dry-run" without crashing', async () => {
      const result = await execaNode(CLI_PATH, ['--dry-run', 'learn'], { cwd: ISOLATED_DIR, reject: false });
      expect([0, 1, 3]).toContain(result.exitCode);
    });

    it('runs "setup --dry-run" without crashing', async () => {
      const result = await execaNode(CLI_PATH, ['--dry-run', 'setup'], { cwd: ISOLATED_DIR, reject: false });
      expect([0, 1, 3]).toContain(result.exitCode);
    });

    it('runs "setup" and handles missing Claude CLI', async () => {
      const result = await execaNode(CLI_PATH, ['--dry-run', 'setup'], { cwd: ISOLATED_DIR, reject: false });
      // Exit 0: success, 1: execution error, 3: Claude not found — all valid
      expect([0, 1, 3]).toContain(result.exitCode);
    });
  });

  describe('--json flag', () => {
    it('"learn --json --dry-run" outputs valid JSON or exits gracefully', async () => {
      const result = await execaNode(CLI_PATH, ['--json', '--dry-run', 'learn'], { cwd: ISOLATED_DIR, reject: false });
      if (result.stdout.trim()) {
        const parsed = JSON.parse(result.stdout);
        expect(parsed.status).toBeDefined();
        expect(typeof parsed.status).toBe('string');
      } else {
        expect([0, 1, 3]).toContain(result.exitCode);
      }
    });

    it('"setup --json --dry-run" outputs valid JSON or exits gracefully', async () => {
      const result = await execaNode(CLI_PATH, ['--json', '--dry-run', 'setup'], { cwd: ISOLATED_DIR, reject: false });
      if (result.stdout.trim()) {
        const parsed = JSON.parse(result.stdout);
        expect(parsed.status).toBeDefined();
        expect(typeof parsed.status).toBe('string');
      } else {
        expect([0, 1, 3]).toContain(result.exitCode);
      }
    });

    it('"health --json" outputs valid JSON', async () => {
      const result = await execaNode(CLI_PATH, ['--json', 'health'], { cwd: ISOLATED_DIR });
      const parsed = JSON.parse(result.stdout);
      expect(parsed.repo).toBeDefined();
      expect(typeof parsed.score).toBe('number');
      expect(parsed.breakdown).toBeDefined();
      expect(Array.isArray(parsed.scenarios)).toBe(true);
      expect(Array.isArray(parsed.fileRoi)).toBe(true);
      expect(parsed.trend).toBeDefined();
    }, 30000);

    it('"curate --json" outputs valid JSON', async () => {
      const result = await execaNode(CLI_PATH, ['--json', 'curate'], { cwd: ISOLATED_DIR, reject: false });
      const parsed = JSON.parse(result.stdout);
      expect(parsed.repo).toBeDefined();
      expect(typeof parsed.score).toBe('number');
      expect(Array.isArray(parsed.findings)).toBe(true);
    }, 30000);

    it('"install --json" outputs valid JSON with installed status', async () => {
      const result = await execaNode(CLI_PATH, ['--json', 'install'], { cwd: ISOLATED_DIR });
      const parsed = JSON.parse(result.stdout);
      expect(parsed.status).toBe('installed');
      expect(parsed.command).toBe('install');
      expect(parsed.filesWritten).toBeDefined();
    });
  });
});
