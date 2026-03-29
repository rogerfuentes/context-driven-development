import { parse as parseYaml } from 'yaml';

import type { Frontmatter } from '../quality/rules/types.js';

export function parseFrontmatter(content: string): { frontmatter: Frontmatter | null; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: null, body: content };

  try {
    const parsed = parseYaml(match[1]);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { frontmatter: null, body: content };
    }
    return { frontmatter: parsed as Frontmatter, body: match[2] };
  } catch {
    return { frontmatter: null, body: content };
  }
}
