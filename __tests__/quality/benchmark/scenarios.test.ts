import { describe, it, expect } from 'vitest';

import { simulateScenarios, DEFAULT_SCENARIOS } from '../../../src/quality/benchmark/scenarios.js';
import { DEFAULT_CONFIG } from '../../../src/config/loader.js';
import type { RuleContext, ContextFile } from '../../../src/quality/rules/types.js';

function makeFile(path: string, content: string, frontmatter?: { name?: string; description?: string }): ContextFile {
  return {
    path,
    absolutePath: `/repo/${path}`,
    content,
    tokens: Math.ceil(content.length / 4),
    frontmatter: frontmatter ?? null,
  };
}

function makeCtx(files: ContextFile[]): RuleContext {
  return {
    repoRoot: '/repo',
    claudeMdPath: '/repo/CLAUDE.md',
    claudeMdContent: '# Project\nSome content.',
    contextDir: '/repo/.claude-context',
    contextFiles: files,
    config: { ...DEFAULT_CONFIG },
  };
}

describe('simulateScenarios', () => {
  it('matches keywords to correct files', () => {
    const files = [
      makeFile('.claude-context/code-style.md', 'Use ESLint for linting. Follow convention patterns.', {
        name: 'Code Style',
        description: 'Code style conventions',
      }),
      makeFile('.claude-context/testing.md', 'Use vitest for testing. Mock external services.', {
        name: 'Testing Guide',
        description: 'Testing patterns and conventions',
      }),
    ];

    const ctx = makeCtx(files);
    const results = simulateScenarios(ctx);

    // "Write tests" scenario should load testing.md
    const writeTests = results.find((r) => r.name === 'Write tests');
    expect(writeTests).toBeDefined();
    expect(writeTests!.filesLoaded).toContain('.claude-context/testing.md');

    // "Code review" scenario should load code-style.md
    const codeReview = results.find((r) => r.name === 'Code review');
    expect(codeReview).toBeDefined();
    expect(codeReview!.filesLoaded).toContain('.claude-context/code-style.md');
  });

  it('always loads CLAUDE.md in every scenario', () => {
    const ctx = makeCtx([]);
    const results = simulateScenarios(ctx);

    for (const result of results) {
      expect(result.filesLoaded).toContain('CLAUDE.md');
    }
  });

  it('loads files with matching filenames', () => {
    const files = [
      makeFile('.claude-context/testing.md', 'Minimal content.', null),
    ];

    const ctx = makeCtx(files);
    const results = simulateScenarios(ctx);

    // testing.md should match the "Write tests" scenario by filename
    const writeTests = results.find((r) => r.name === 'Write tests');
    expect(writeTests).toBeDefined();
    expect(writeTests!.filesLoaded).toContain('.claude-context/testing.md');
  });

  it('supports custom scenarios', () => {
    const customScenarios = [
      {
        name: 'Deploy',
        description: 'Deploy to production',
        keywords: ['deploy', 'ci', 'pipeline', 'release'],
      },
    ];

    const files = [
      makeFile('.claude-context/deploy.md', 'CI/CD pipeline guide for release deployments.', {
        name: 'Deployment',
        description: 'CI/CD deployment guide',
      }),
    ];

    const ctx = makeCtx(files);
    const results = simulateScenarios(ctx, customScenarios);

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Deploy');
    expect(results[0].filesLoaded).toContain('.claude-context/deploy.md');
  });

  it('does not load files without keyword matches', () => {
    const files = [
      makeFile('.claude-context/random.md', 'Nothing relevant here at all.', {
        name: 'Random Notes',
        description: 'Miscellaneous notes',
      }),
    ];

    const ctx = makeCtx(files);
    const results = simulateScenarios(ctx);

    // random.md should not be loaded in any scenario
    for (const result of results) {
      const contextFiles = result.filesLoaded.filter((f) => f !== 'CLAUDE.md');
      expect(contextFiles).not.toContain('.claude-context/random.md');
    }
  });

  it('runs default scenarios when none specified', () => {
    const ctx = makeCtx([]);
    const results = simulateScenarios(ctx);

    expect(results).toHaveLength(DEFAULT_SCENARIOS.length);
    expect(results.map((r) => r.name)).toEqual(DEFAULT_SCENARIOS.map((s) => s.name));
  });
});
