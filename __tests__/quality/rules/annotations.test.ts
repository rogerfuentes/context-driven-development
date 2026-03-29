import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { checkAnnotations } from '../../../src/quality/rules/annotations.js';
import type { RuleContext } from '../../../src/quality/rules/types.js';
import { DEFAULT_CONFIG } from '../../../src/config/loader.js';

const TMP_DIR = join(process.cwd(), '__tests__', '.tmp-annotations');

function makeCtx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    repoRoot: TMP_DIR,
    claudeMdPath: null,
    claudeMdContent: null,
    contextDir: null,
    contextFiles: [],
    config: DEFAULT_CONFIG,
    ...overrides,
  };
}

describe('checkAnnotations', () => {
  beforeEach(async () => {
    await mkdir(join(TMP_DIR, 'src'), { recursive: true });
    await mkdir(join(TMP_DIR, '.claude/context'), { recursive: true });
  });

  afterEach(async () => {
    await rm(TMP_DIR, { recursive: true, force: true });
  });

  it('detects @context annotations in TS files', async () => {
    await writeFile(
      join(TMP_DIR, 'src', 'index.ts'),
      '// @context: .claude/context/arch.md\nexport const x = 1;\n',
    );
    await writeFile(
      join(TMP_DIR, '.claude/context', 'arch.md'),
      '# Architecture\n',
    );

    const ctx = makeCtx({
      contextDir: join(TMP_DIR, '.claude/context'),
      contextFiles: [
        {
          path: '.claude/context/arch.md',
          absolutePath: join(TMP_DIR, '.claude/context', 'arch.md'),
          content: '# Architecture\n',
          tokens: 4,
          frontmatter: null,
          referenced: true,
        },
      ],
    });

    const findings = await checkAnnotations(ctx);
    // Target exists, so no target-exists error
    expect(findings.filter((f) => f.rule === 'annotation-target-exists').length).toBe(0);
  });

  it('detects @context annotations in Python files', async () => {
    await writeFile(
      join(TMP_DIR, 'src', 'main.py'),
      '# @context: .claude/context/python.md\nimport os\n',
    );

    const ctx = makeCtx();
    const findings = await checkAnnotations(ctx);
    // Target doesn't exist
    expect(findings.filter((f) => f.rule === 'annotation-target-exists').length).toBe(1);
  });

  it('flags non-existent target files', async () => {
    await writeFile(
      join(TMP_DIR, 'src', 'app.ts'),
      '// @context: .claude/context/missing.md\nexport {};\n',
    );

    const ctx = makeCtx();
    const findings = await checkAnnotations(ctx);
    const targetFindings = findings.filter((f) => f.rule === 'annotation-target-exists');
    expect(targetFindings.length).toBe(1);
    expect(targetFindings[0].severity).toBe('error');
  });

  it('flags too many annotations', async () => {
    // Create more annotations than the threshold
    for (let i = 0; i < 7; i++) {
      await writeFile(
        join(TMP_DIR, 'src', `file${i}.ts`),
        `// @context: .claude/context/ctx${i}.md\nexport {};\n`,
      );
    }

    const ctx = makeCtx();
    const findings = await checkAnnotations(ctx);
    expect(findings.filter((f) => f.rule === 'annotation-count').length).toBe(1);
  });

  it('flags annotations in generated files', async () => {
    await mkdir(join(TMP_DIR, 'src', '__generated__'), { recursive: true });
    await writeFile(
      join(TMP_DIR, 'src', '__generated__', 'types.ts'),
      '// @context: .claude/context/gen.md\nexport type X = string;\n',
    );

    const ctx = makeCtx();
    const findings = await checkAnnotations(ctx);
    expect(findings.filter((f) => f.rule === 'annotation-in-generated').length).toBe(1);
  });

  it('ignores annotations in node_modules', async () => {
    await mkdir(join(TMP_DIR, 'node_modules', 'pkg'), { recursive: true });
    await writeFile(
      join(TMP_DIR, 'node_modules', 'pkg', 'index.ts'),
      '// @context: .claude/context/something.md\nexport {};\n',
    );

    const ctx = makeCtx();
    const findings = await checkAnnotations(ctx);
    // Should not find the annotation (node_modules is excluded)
    expect(
      findings.filter(
        (f) => f.file?.includes('node_modules'),
      ).length,
    ).toBe(0);
  });

  it('detects duplicate annotation targets', async () => {
    await writeFile(
      join(TMP_DIR, 'src', 'a.ts'),
      '// @context: .claude/context/shared.md\nexport {};\n',
    );
    await writeFile(
      join(TMP_DIR, 'src', 'b.ts'),
      '// @context: .claude/context/shared.md\nexport {};\n',
    );

    const ctx = makeCtx();
    const findings = await checkAnnotations(ctx);
    expect(findings.filter((f) => f.rule === 'annotation-duplicate-target').length).toBe(1);
  });
});
