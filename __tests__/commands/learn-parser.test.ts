import { describe, it, expect } from 'vitest';
import { parseLearnResponse } from '../../src/commands/learn-parser.js';

describe('parseLearnResponse', () => {
  it('parses clean JSON response', () => {
    const output = JSON.stringify({
      action: 'create',
      targetFile: '.claude/context/new-patterns.md',
      content: '---\nname: Patterns\n---\n# Patterns',
      overlap: [{ file: 'style.md', similarity: 0.3 }],
      claudeMdUpdate: 'updated content',
    });

    const result = parseLearnResponse(output);
    expect(result.action).toBe('create');
    expect(result.targetFile).toBe('.claude/context/new-patterns.md');
    expect(result.content).toBe('---\nname: Patterns\n---\n# Patterns');
    expect(result.overlap).toEqual([{ file: 'style.md', similarity: 0.3 }]);
    expect(result.claudeMdUpdate).toBe('updated content');
  });

  it('parses JSON in markdown code blocks', () => {
    const output = `Here is the result:

\`\`\`json
{
  "action": "merge",
  "targetFile": ".claude-context/architecture.md",
  "content": "merged content",
  "overlap": [],
  "claudeMdUpdate": null
}
\`\`\`

Done.`;

    const result = parseLearnResponse(output);
    expect(result.action).toBe('merge');
    expect(result.targetFile).toBe('.claude-context/architecture.md');
    expect(result.content).toBe('merged content');
    expect(result.overlap).toEqual([]);
  });

  it('uses heuristic fallback for text-only response with create', () => {
    const output = 'I created `.claude/context/testing.md` with the new testing patterns.';

    const result = parseLearnResponse(output);
    expect(result.action).toBe('create');
    expect(result.targetFile).toBe('.claude/context/testing.md');
    expect(result.content).toBe(output);
    expect(result.overlap).toEqual([]);
  });

  it('detects merge action in heuristic fallback', () => {
    const output = 'I merged the new knowledge into `style-guide.md` successfully.';

    const result = parseLearnResponse(output);
    expect(result.action).toBe('merge');
    expect(result.targetFile).toBe('style-guide.md');
  });

  it('returns defaults for unparseable output', () => {
    const output = 'Something happened but no clear file reference.';

    const result = parseLearnResponse(output);
    expect(result.action).toBe('create');
    expect(result.targetFile).toBe('unknown.md');
    expect(result.content).toBe(output);
    expect(result.overlap).toEqual([]);
    expect(result.claudeMdUpdate).toBeUndefined();
  });

  it('handles JSON with missing optional fields', () => {
    const output = JSON.stringify({
      action: 'create',
      targetFile: 'new.md',
    });

    const result = parseLearnResponse(output);
    expect(result.action).toBe('create');
    expect(result.targetFile).toBe('new.md');
    expect(result.content).toBe('');
    expect(result.overlap).toEqual([]);
    expect(result.claudeMdUpdate).toBeUndefined();
  });

  it('handles malformed JSON gracefully', () => {
    const output = '{"action": "create", "targetFile": bad json here}';

    const result = parseLearnResponse(output);
    // Falls through to heuristic
    expect(result.action).toBe('create');
    expect(result.overlap).toEqual([]);
  });
});
