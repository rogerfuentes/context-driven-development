import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const TMP_DIR = join(process.cwd(), '__tests__', '.tmp-curate');

describe('curate command (integration)', () => {
  beforeEach(async () => {
    await mkdir(join(TMP_DIR, '.git'), { recursive: true });
    await mkdir(join(TMP_DIR, '.claude/context'), { recursive: true });
  });

  afterEach(async () => {
    await rm(TMP_DIR, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('catches expected issues in a fixture directory', async () => {
    // Create a trivial CLAUDE.md
    await writeFile(join(TMP_DIR, 'CLAUDE.md'), 'Short file.\n');

    // Create a context file with issues
    await writeFile(
      join(TMP_DIR, '.claude/context', 'style.md'),
      'You might want to consider using this pattern etc. and so on.\n',
    );

    // Import and run scanner + rules manually (avoiding process.exit)
    const { scanRepo } = await import('../../src/quality/scanner.js');
    const { checkStructure } = await import('../../src/quality/rules/structure.js');
    const { checkClarity } = await import('../../src/quality/rules/clarity.js');
    const { checkEfficiency } = await import('../../src/quality/rules/efficiency.js');
    const { computeScore } = await import('../../src/quality/scorer.js');

    const ctx = await scanRepo(TMP_DIR);
    const findings = [
      ...checkStructure(ctx),
      ...checkClarity(ctx),
      ...checkEfficiency(ctx),
    ];

    // Should detect trivial CLAUDE.md
    expect(findings.some((f) => f.rule === 'claude-md-exists')).toBe(true);

    // Should detect hedge words
    expect(findings.some((f) => f.rule === 'hedge-words')).toBe(true);

    // Should detect open-ended lists (etc., and so on)
    expect(findings.some((f) => f.rule === 'open-ended-lists')).toBe(true);

    // Score should be less than 100
    const score = computeScore(findings);
    expect(score).toBeLessThan(100);
  });

  it('produces valid JSON report', async () => {
    await writeFile(join(TMP_DIR, 'CLAUDE.md'), 'Line\n'.repeat(60));

    const { scanRepo } = await import('../../src/quality/scanner.js');
    const { checkStructure } = await import('../../src/quality/rules/structure.js');
    const { checkEfficiency } = await import('../../src/quality/rules/efficiency.js');
    const { computeScore } = await import('../../src/quality/scorer.js');
    const { formatJsonReport } = await import('../../src/quality/report.js');

    const ctx = await scanRepo(TMP_DIR);
    const findings = [...checkStructure(ctx), ...checkEfficiency(ctx)];
    const score = computeScore(findings);
    const json = formatJsonReport({ repoName: 'test', score, findings, ctx });

    const parsed = JSON.parse(json);
    expect(parsed.repo).toBe('test');
    expect(typeof parsed.score).toBe('number');
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(parsed.tokenBudget).toBeDefined();
    expect(parsed.version).toBe('0.1.0');
    expect(parsed.timestamp).toBeDefined();
  });

  it('returns score 100 for a clean repo', async () => {
    // Create a substantial CLAUDE.md with progressive disclosure (must be >= 50 lines)
    const claudeContent =
      '# Project\n\n' +
      'Description of the project.\n\n'.repeat(10) +
      '| Document | When to Use |\n|---|---|\n| style.md | Writing code |\n\n' +
      'More content.\n'.repeat(25);

    await writeFile(join(TMP_DIR, 'CLAUDE.md'), claudeContent);
    await writeFile(
      join(TMP_DIR, '.claude/context', 'style.md'),
      '---\nname: Style Guide\ndescription: Code style conventions\n---\n# Style Guide\nUse ESLint.\n',
    );

    const { scanRepo } = await import('../../src/quality/scanner.js');
    const { checkStructure } = await import('../../src/quality/rules/structure.js');
    const { checkClarity } = await import('../../src/quality/rules/clarity.js');
    const { checkEfficiency } = await import('../../src/quality/rules/efficiency.js');
    const { computeScore } = await import('../../src/quality/scorer.js');

    const ctx = await scanRepo(TMP_DIR);

    // Override CLAUDE.md content reference to include the context file
    // The scanner already picked it up, but CLAUDE.md needs to reference it
    ctx.claudeMdContent = claudeContent + '\nstyle.md\n';

    const findings = [
      ...checkStructure(ctx),
      ...checkClarity(ctx),
      ...checkEfficiency(ctx),
    ];

    // Filter out info-level findings (they don't affect score but let's verify no errors/warnings)
    const impactful = findings.filter((f) => f.severity !== 'info');
    const score = computeScore(findings);
    expect(impactful).toEqual([]);
    expect(score).toBe(100);
  });
});

describe('curate-parser', () => {
  it('parses valid JSON response with findings', async () => {
    const { parseCurateFullResponse } = await import('../../src/commands/curate-parser.js');

    const output = JSON.stringify({
      findings: [
        {
          severity: 'error',
          rule: 'contradiction',
          message: 'CLAUDE.md says use npm but style.md says use pnpm',
          file: 'CLAUDE.md',
        },
        {
          severity: 'warning',
          rule: 'stale-reference',
          message: 'References src/old-module.ts which no longer exists',
        },
        {
          severity: 'info',
          rule: 'missing-pattern',
          message: 'No documentation for the database migration pattern',
        },
      ],
    });

    const result = parseCurateFullResponse(output);
    expect(result.findings).toHaveLength(3);
    expect(result.findings[0].severity).toBe('error');
    expect(result.findings[0].rule).toBe('contradiction');
    expect(result.findings[0].file).toBe('CLAUDE.md');
    expect(result.findings[1].severity).toBe('warning');
    expect(result.findings[2].severity).toBe('info');
  });

  it('parses JSON wrapped in markdown code block', async () => {
    const { parseCurateFullResponse } = await import('../../src/commands/curate-parser.js');

    const output = '```json\n{"findings": [{"severity": "warning", "rule": "stale-reference", "message": "Old pattern referenced"}]}\n```';
    const result = parseCurateFullResponse(output);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].rule).toBe('stale-reference');
  });

  it('filters out findings with invalid severity', async () => {
    const { parseCurateFullResponse } = await import('../../src/commands/curate-parser.js');

    const output = JSON.stringify({
      findings: [
        { severity: 'error', rule: 'contradiction', message: 'Valid finding' },
        { severity: 'critical', rule: 'bad', message: 'Invalid severity' },
        { severity: 'warning', message: 'Missing rule defaults to semantic' },
      ],
    });

    const result = parseCurateFullResponse(output);
    expect(result.findings).toHaveLength(2);
    expect(result.findings[0].severity).toBe('error');
    expect(result.findings[1].severity).toBe('warning');
    expect(result.findings[1].rule).toBe('semantic');
  });

  it('returns empty findings for unparseable output', async () => {
    const { parseCurateFullResponse } = await import('../../src/commands/curate-parser.js');

    const result = parseCurateFullResponse('Some random text without JSON');
    expect(result.findings).toEqual([]);
  });

  it('returns empty findings for malformed JSON', async () => {
    const { parseCurateFullResponse } = await import('../../src/commands/curate-parser.js');

    const result = parseCurateFullResponse('{"findings": not valid json}');
    expect(result.findings).toEqual([]);
  });
});
