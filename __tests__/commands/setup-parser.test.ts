import { describe, it, expect } from 'vitest';
import { parseSetupResponse } from '../../src/commands/setup-parser.js';

describe('parseSetupResponse', () => {
  it('parses clean JSON response', () => {
    const output = JSON.stringify({
      files: [
        { path: 'CLAUDE.md', action: 'created' },
        { path: '.claude/context/architecture.md', action: 'created' },
      ],
      projectType: 'TypeScript monorepo',
      topics: ['architecture', 'code-style', 'testing'],
    });

    const result = parseSetupResponse(output);

    expect(result.files).toHaveLength(2);
    expect(result.files[0]).toEqual({ path: 'CLAUDE.md', action: 'created' });
    expect(result.projectType).toBe('TypeScript monorepo');
    expect(result.topics).toEqual(['architecture', 'code-style', 'testing']);
  });

  it('parses JSON wrapped in markdown code blocks', () => {
    const output = `Here is the result:

\`\`\`json
{
  "files": [{ "path": "CLAUDE.md", "action": "updated" }],
  "projectType": "Next.js app",
  "topics": ["frontend"]
}
\`\`\`

Done!`;

    const result = parseSetupResponse(output);

    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toEqual({ path: 'CLAUDE.md', action: 'updated' });
    expect(result.projectType).toBe('Next.js app');
    expect(result.topics).toEqual(['frontend']);
  });

  it('falls back to heuristic when no JSON present', () => {
    const output = `I created the following files:
Created CLAUDE.md
Created .claude/context/style.md
Updated .claude/context/testing.md

Project type: React SPA
Topics: architecture, testing, code-style`;

    const result = parseSetupResponse(output);

    expect(result.files.length).toBeGreaterThan(0);
    expect(result.files.some((f) => f.path === 'CLAUDE.md' && f.action === 'created')).toBe(true);
    expect(result.projectType).toBe('React SPA');
    expect(result.topics).toContain('architecture');
  });

  it('extracts file paths from "created" and "updated" messages', () => {
    const output = `Generated style-guide.md
Updated architecture.md`;

    const result = parseSetupResponse(output);

    expect(result.files.some((f) => f.path === 'style-guide.md' && f.action === 'created')).toBe(
      true,
    );
    expect(
      result.files.some((f) => f.path === 'architecture.md' && f.action === 'updated'),
    ).toBe(true);
  });

  it('returns defaults for unparseable output', () => {
    const output = 'Something went wrong, no structured data here.';

    const result = parseSetupResponse(output);

    expect(result.files).toEqual([]);
    expect(result.projectType).toBe('unknown');
    expect(result.topics).toEqual([]);
  });

  it('handles invalid JSON gracefully', () => {
    const output = '```json\n{ broken json }\n```';

    const result = parseSetupResponse(output);

    // Should fall through to heuristic (no crash)
    expect(result.projectType).toBe('unknown');
    expect(result.files).toEqual([]);
  });

  it('deduplicates files mentioned multiple times', () => {
    const output = `Created CLAUDE.md
Wrote CLAUDE.md`;

    const result = parseSetupResponse(output);

    const claudeFiles = result.files.filter((f) => f.path === 'CLAUDE.md');
    expect(claudeFiles).toHaveLength(1);
  });

  it('handles files with backtick-wrapped paths', () => {
    const output = 'Created `CLAUDE.md` successfully';

    const result = parseSetupResponse(output);

    expect(result.files.some((f) => f.path === 'CLAUDE.md')).toBe(true);
  });
});
