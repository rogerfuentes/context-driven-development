import { describe, it, expect } from 'vitest';
import { checkClarity } from '../../../src/quality/rules/clarity.js';
import type { RuleContext } from '../../../src/quality/rules/types.js';
import { DEFAULT_CONFIG } from '../../../src/config/loader.js';

function makeCtx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    repoRoot: '/tmp/test',
    claudeMdPath: '/tmp/test/CLAUDE.md',
    claudeMdContent: '',
    contextDir: null,
    contextFiles: [],
    config: DEFAULT_CONFIG,
    ...overrides,
  };
}

describe('checkClarity', () => {
  it('detects double negatives', () => {
    const ctx = makeCtx({
      claudeMdContent: 'Do NOT avoid using this pattern.\nDo not prevent this from happening.',
    });
    const findings = checkClarity(ctx);
    const doubles = findings.filter((f) => f.rule === 'double-negatives');
    expect(doubles.length).toBe(2);
  });

  it('detects hedge words', () => {
    const ctx = makeCtx({
      claudeMdContent: 'You might want to use this. Perhaps try this instead. Consider using X.',
    });
    const findings = checkClarity(ctx);
    const hedges = findings.filter((f) => f.rule === 'hedge-words');
    expect(hedges.length).toBe(3);
  });

  it('detects open-ended lists', () => {
    const ctx = makeCtx({
      claudeMdContent: 'Supports: TypeScript, JavaScript, etc.\nAlso Python and so on.',
    });
    const findings = checkClarity(ctx);
    const openEnded = findings.filter((f) => f.rule === 'open-ended-lists');
    expect(openEnded.length).toBe(2);
  });

  it('detects passive voice in rules', () => {
    const ctx = makeCtx({
      claudeMdContent: 'ESLint should be used for linting. Prettier is preferred for formatting.',
    });
    const findings = checkClarity(ctx);
    const passive = findings.filter((f) => f.rule === 'passive-voice-in-rules');
    expect(passive.length).toBe(2);
  });

  it('ignores content inside code blocks', () => {
    const ctx = makeCtx({
      claudeMdContent: `Some text.

\`\`\`typescript
// You might want to consider using this
// Do NOT avoid this
const etc = "etc.";
\`\`\`

Clean text here.
`,
    });
    const findings = checkClarity(ctx);
    // Should not find hedge words or double negatives from inside the code block
    expect(findings.filter((f) => f.rule === 'hedge-words').length).toBe(0);
    expect(findings.filter((f) => f.rule === 'double-negatives').length).toBe(0);
  });

  it('returns empty for clean content', () => {
    const ctx = makeCtx({
      claudeMdContent: 'Use ESLint for linting. Run tests before committing.',
    });
    const findings = checkClarity(ctx);
    expect(findings.length).toBe(0);
  });

  it('scans context files too', () => {
    const ctx = makeCtx({
      claudeMdContent: 'Clean.',
      contextFiles: [
        {
          path: '.claude-context/test.md',
          absolutePath: '/tmp/test/.claude-context/test.md',
          content: 'You might want to try this.',
          tokens: 7,
          frontmatter: null,
          referenced: true,
        },
      ],
    });
    const findings = checkClarity(ctx);
    const hedges = findings.filter((f) => f.rule === 'hedge-words');
    expect(hedges.length).toBe(1);
    expect(hedges[0].file).toBe('.claude-context/test.md');
  });
});
