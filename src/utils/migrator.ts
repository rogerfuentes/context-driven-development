import { readFile } from 'node:fs/promises';
import { basename, dirname, join, normalize, relative, resolve } from 'node:path';

import { glob } from 'tinyglobby';

import { fileExists } from './fs.js';
import { parseFrontmatter } from './frontmatter.js';
import { estimateTokens } from '../quality/token-counter.js';

export interface LegacyFile {
  sourcePath: string;
  relativePath: string;
  filename: string;
  content: string;
  sourceDir: string;
  tokens: number;
}

/**
 * Discover directories containing .md files that CLAUDE.md references
 * but that are NOT the context directory. These are "legacy" sources
 * that should be compressed and migrated into context.
 *
 * Also scans well-known legacy locations (.claude/docs/, .claude/patterns/)
 * even if CLAUDE.md doesn't reference them.
 */
export async function scanLegacyDirs(
  repoRoot: string,
  claudeMdContent: string | null,
  contextDir: string | null,
): Promise<LegacyFile[]> {
  const absRoot = resolve(repoRoot);
  const dirs = new Set<string>();

  // 1. Extract directories from CLAUDE.md references
  if (claudeMdContent) {
    for (const dir of extractReferencedDirs(claudeMdContent)) {
      dirs.add(dir);
    }
  }

  // 2. Add well-known reference doc locations
  for (const known of ['.claude/docs', '.claude/patterns', '.claude/rag', '.claude-context', 'docs']) {
    dirs.add(known);
  }

  // 3. Temporal/planning pattern — used to exclude time-bound documents
  // (plans, spikes, RFCs, ADRs, strategies, initiatives, specs) that should NOT become context files.
  // Temporal patterns: match directory names and standalone filenames that indicate
  // time-bound documents. Use path separators to avoid false positives on compound
  // words (e.g., "cost-analysis.md" should NOT match, but "initiatives/I1/analysis.md" should).
  const temporalDirPattern = /\b(plans?|spikes?|rfcs?|adrs?|strateg(y|ies)|proposals?|tech-plans?|decisions?|initiatives?)\b/i;
  const temporalFilePattern = /(?:^|\/)(?:spec|analysis|summary|learnings|strategy)(?:[-.]|$)/i;

  // 3. Canonicalize context dir for exclusion
  const contextRel = contextDir
    ? normalize(relative(absRoot, resolve(absRoot, contextDir))).replace(/\\/g, '/')
    : null;

  const files: LegacyFile[] = [];
  const seenPaths = new Set<string>();

  for (const rawDir of dirs) {
    // Canonicalize: strip leading ./, normalize slashes
    const dir = normalize(rawDir).replace(/\\/g, '/').replace(/^\.\//, '');

    // Skip the context directory
    if (contextRel && (dir === contextRel || dir.startsWith(contextRel + '/'))) continue;

    // Containment: ensure dir resolves inside repo root
    const absDir = resolve(absRoot, dir);
    if (!absDir.startsWith(absRoot + '/') && absDir !== absRoot) continue;

    if (!(await fileExists(absDir))) continue;

    const mdFiles = await glob('**/*.md', { cwd: absDir });
    for (const relPath of mdFiles) {
      const sourcePath = join(absDir, relPath);
      const relativePath = `${dir}/${relPath}`;

      // Skip temporal/planning documents — they are time-bound and should not
      // become permanent context files (e.g., docs/plans/*, docs/spikes/*)
      if (temporalDirPattern.test(relativePath) || temporalFilePattern.test(relativePath)) continue;

      if (seenPaths.has(relativePath)) continue;
      seenPaths.add(relativePath);

      const content = await readFile(sourcePath, 'utf-8');
      if (!content.trim()) continue;

      files.push({
        sourcePath,
        relativePath,
        filename: basename(relPath),
        content,
        sourceDir: dir,
        tokens: estimateTokens(content),
      });
    }
  }

  return files;
}

/**
 * Extract unique directory paths from CLAUDE.md file references.
 * Only includes top-level reference directories (e.g., `.claude/docs`, `docs/`),
 * not deep package paths (e.g., `packages/foo/.claude/`).
 */
function extractReferencedDirs(claudeMdContent: string): string[] {
  const dirs = new Set<string>();
  const patterns = [
    /`([^`]*\.md)`/g,
    /\(([^)]*\.md)\)/g,
    /(?:^|\s)(\.\.?\/[\w./-]+\.md)\b/gm,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(claudeMdContent)) !== null) {
      const ref = match[1].trim();
      if (ref.startsWith('http') || ref.includes(' ') || ref.length > 200) continue;
      if (!ref.includes('/')) continue;

      const dir = dirname(ref);
      if (!dir || dir === '.') continue;

      // Skip paths inside packages/apps subdirectories
      if (/^(packages|apps|node_modules)\//.test(dir)) continue;

      // Skip initiative/spec directories — these are temporal SDD artifacts
      if (/^initiatives\b/i.test(dir)) continue;
      if (/\bspecs?\b/.test(dir)) continue;

      // Skip Claude Code operational directories
      if (/\b(commands|skills|agents|workflows|rules)\b/.test(dir)) continue;

      // Skip generic references like CLAUDE.md or SESSION_NOTES.md
      if (basename(ref) === 'CLAUDE.md' || basename(ref) === 'SESSION_NOTES.md') continue;

      // Skip bare .claude/ — files directly there are operational
      if (dir === '.claude') continue;

      dirs.add(dir);
    }
  }

  return [...dirs];
}

/**
 * Infer YAML frontmatter from file content and filename.
 * Merges with existing frontmatter — never drops existing fields.
 */
export function inferFrontmatter(
  content: string,
  filename: string,
): { name: string; description: string; existingFields: Record<string, unknown> } {
  const { frontmatter } = parseFrontmatter(content);

  // Preserve all existing frontmatter fields
  const existingFields: Record<string, unknown> = frontmatter ? { ...frontmatter } : {};

  if (frontmatter?.name && frontmatter?.description) {
    return {
      name: frontmatter.name as string,
      description: frontmatter.description as string,
      existingFields,
    };
  }

  // Infer name from first H1, or title-case the filename
  let name = (frontmatter?.name as string | undefined);
  if (!name) {
    const h1Match = content.match(/^#\s+(.+)$/m);
    name = h1Match
      ? h1Match[1].trim()
      : basename(filename, '.md')
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // Infer description from first non-heading paragraph (collect full paragraph)
  let description = (frontmatter?.description as string | undefined);
  if (!description) {
    const { body } = parseFrontmatter(content);
    const lines = body.split('\n');
    const paragraphLines: string[] = [];
    let collecting = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('|') || trimmed.startsWith('```')) {
        if (collecting) break; // end of paragraph
        continue;
      }
      paragraphLines.push(trimmed);
      collecting = true;
    }

    description = paragraphLines.join(' ').slice(0, 120) || `Reference content migrated from ${filename}`;
  }

  return { name, description, existingFields };
}

// Re-export for tests
export { extractReferencedDirs as _extractReferencedDirs };
