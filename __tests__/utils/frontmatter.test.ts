import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../../src/utils/frontmatter.js';

describe('parseFrontmatter', () => {
  it('parses valid frontmatter', () => {
    const content = `---
name: Test File
description: A test context file
reference: ./other.md
---
# Body content here
`;
    const result = parseFrontmatter(content);
    expect(result.frontmatter).not.toBeNull();
    expect(result.frontmatter?.name).toBe('Test File');
    expect(result.frontmatter?.description).toBe('A test context file');
    expect(result.frontmatter?.reference).toBe('./other.md');
    expect(result.body).toContain('# Body content here');
  });

  it('returns null frontmatter when none present', () => {
    const content = '# Just a heading\nSome content\n';
    const result = parseFrontmatter(content);
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe(content);
  });

  it('returns null frontmatter for invalid YAML', () => {
    const content = `---
key: [unclosed bracket
  - broken: {nope
---
body
`;
    const result = parseFrontmatter(content);
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe(content);
  });

  it('preserves body content after frontmatter', () => {
    const content = `---
name: Test
---
First line
Second line
`;
    const result = parseFrontmatter(content);
    expect(result.body).toContain('First line');
    expect(result.body).toContain('Second line');
  });

  it('handles frontmatter with extra fields', () => {
    const content = `---
name: Test
custom_field: hello
---
body
`;
    const result = parseFrontmatter(content);
    expect(result.frontmatter?.name).toBe('Test');
    expect(result.frontmatter?.custom_field).toBe('hello');
  });
});
