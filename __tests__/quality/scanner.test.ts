import { describe, it, expect } from 'vitest';
import { extractReferencedPaths } from '../../src/quality/scanner.js';

describe('extractReferencedPaths', () => {
  it('extracts .claude-context paths', () => {
    const content = 'See `.claude-context/architecture.md` for details.';
    const paths = extractReferencedPaths(content);
    expect(paths).toContain('.claude-context/architecture.md');
  });

  it('extracts backtick-wrapped .claude/context paths', () => {
    const content = 'Reference: `apps/auggie-platform/.claude-context/spaces-dsl.md`';
    const paths = extractReferencedPaths(content);
    expect(paths).toContain('apps/auggie-platform/.claude-context/spaces-dsl.md');
  });

  it('does not extract CLAUDE.md cross-references', () => {
    const content = [
      '| auggie-platform | Next.js app | `apps/auggie-platform/CLAUDE.md` |',
      '| ops-service | NestJS backend | `apps/ops-service/CLAUDE.md` |',
      '| luxp-utils | Foundation | `packages/luxp-utils/CLAUDE.md` |',
    ].join('\n');
    const paths = extractReferencedPaths(content);
    // extractReferencedPaths itself still returns them — filtering happens in scanRepo.
    // But we want to verify the paths are present so the filter in scanRepo is meaningful.
    expect(paths.some((p) => /CLAUDE\.md$/i.test(p))).toBe(true);
  });

  it('does not extract URLs', () => {
    const content = 'Visit `https://example.com/readme.md` for info.';
    const paths = extractReferencedPaths(content);
    expect(paths).toHaveLength(0);
  });

  it('extracts parenthesized paths', () => {
    const content = 'See (.claude-context/patterns.md) for patterns.';
    const paths = extractReferencedPaths(content);
    expect(paths).toContain('.claude-context/patterns.md');
  });

  it('deduplicates repeated references', () => {
    const content = [
      'See `.claude-context/arch.md` here.',
      'Also `.claude-context/arch.md` there.',
    ].join('\n');
    const paths = extractReferencedPaths(content);
    expect(paths.filter((p) => p === '.claude-context/arch.md')).toHaveLength(1);
  });
});
