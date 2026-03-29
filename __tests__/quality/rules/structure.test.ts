import { describe, it, expect } from 'vitest';
import { checkStructure } from '../../../src/quality/rules/structure.js';
import type { RuleContext } from '../../../src/quality/rules/types.js';
import { DEFAULT_CONFIG } from '../../../src/config/loader.js';

function makeCtx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    repoRoot: '/tmp/test',
    claudeMdPath: null,
    claudeMdContent: null,
    contextDir: null,
    contextFiles: [],
    config: DEFAULT_CONFIG,
    ...overrides,
  };
}

describe('checkStructure (sync)', () => {
  it('detects missing CLAUDE.md', () => {
    const ctx = makeCtx();
    const findings = checkStructure(ctx);
    const missing = findings.filter((f) => f.rule === 'claude-md-exists');
    expect(missing.length).toBe(1);
    expect(missing[0].severity).toBe('error');
  });

  it('detects trivial CLAUDE.md (under 50 lines)', () => {
    const ctx = makeCtx({
      claudeMdPath: '/tmp/test/CLAUDE.md',
      claudeMdContent: 'Line\n'.repeat(10),
    });
    const findings = checkStructure(ctx);
    const trivial = findings.filter((f) => f.rule === 'claude-md-exists');
    expect(trivial.length).toBe(1);
    expect(trivial[0].message).toContain('trivial');
  });

  it('passes for adequate CLAUDE.md', () => {
    const ctx = makeCtx({
      claudeMdPath: '/tmp/test/CLAUDE.md',
      claudeMdContent: 'Line\n'.repeat(60),
    });
    const findings = checkStructure(ctx);
    expect(findings.filter((f) => f.rule === 'claude-md-exists').length).toBe(0);
  });

  it('detects missing context directory', () => {
    const ctx = makeCtx({ contextDir: null });
    const findings = checkStructure(ctx);
    expect(findings.filter((f) => f.rule === 'context-dir-exists').length).toBe(1);
  });

  it('detects missing frontmatter', () => {
    const ctx = makeCtx({
      contextDir: '/tmp/test/.claude-context',
      contextFiles: [
        {
          path: '.claude-context/test.md',
          absolutePath: '/tmp/test/.claude-context/test.md',
          content: '# No frontmatter',
          tokens: 5,
          frontmatter: null,
          referenced: true,
        },
      ],
    });
    const findings = checkStructure(ctx);
    expect(findings.filter((f) => f.rule === 'frontmatter-valid').length).toBe(1);
  });

  it('detects frontmatter missing name field', () => {
    const ctx = makeCtx({
      contextDir: '/tmp/test/.claude-context',
      contextFiles: [
        {
          path: '.claude-context/test.md',
          absolutePath: '/tmp/test/.claude-context/test.md',
          content: '---\ndescription: test\n---\n# Content',
          tokens: 5,
          frontmatter: { description: 'test' },
          referenced: true,
        },
      ],
    });
    const findings = checkStructure(ctx);
    const fmFindings = findings.filter((f) => f.rule === 'frontmatter-valid');
    expect(fmFindings.some((f) => f.message.includes('"name"'))).toBe(true);
  });

  it('detects missing progressive disclosure', () => {
    const ctx = makeCtx({
      claudeMdPath: '/tmp/test/CLAUDE.md',
      claudeMdContent: 'Line\n'.repeat(60),
      contextDir: '/tmp/test/.claude-context',
      contextFiles: [
        {
          path: '.claude-context/test.md',
          absolutePath: '/tmp/test/.claude-context/test.md',
          content: '# Test',
          tokens: 2,
          frontmatter: null,
          referenced: true,
        },
      ],
    });
    const findings = checkStructure(ctx);
    expect(findings.filter((f) => f.rule === 'progressive-disclosure').length).toBe(1);
  });

  it('passes progressive disclosure when "When to Use" is present', () => {
    const ctx = makeCtx({
      claudeMdPath: '/tmp/test/CLAUDE.md',
      claudeMdContent: 'Line\n'.repeat(55) + '| When to Use |\n',
      contextDir: '/tmp/test/.claude-context',
      contextFiles: [
        {
          path: '.claude-context/test.md',
          absolutePath: '/tmp/test/.claude-context/test.md',
          content: '# Test',
          tokens: 2,
          frontmatter: null,
          referenced: true,
        },
      ],
    });
    const findings = checkStructure(ctx);
    expect(findings.filter((f) => f.rule === 'progressive-disclosure').length).toBe(0);
  });
});
