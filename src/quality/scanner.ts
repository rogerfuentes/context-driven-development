import { readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { glob } from 'tinyglobby';

import { loadConfig } from '../config/loader.js';
import { fileExists } from '../utils/fs.js';
import { parseFrontmatter } from '../utils/frontmatter.js';
import type { ContextFile, RuleContext } from './rules/types.js';
import { estimateTokens } from './token-counter.js';

async function findClaudeMd(repoRoot: string): Promise<string | null> {
  for (const name of ['CLAUDE.md', 'claude.md']) {
    const p = join(repoRoot, name);
    if (await fileExists(p)) return p;
  }
  return null;
}

/**
 * Extract file paths referenced in CLAUDE.md content.
 * Matches patterns like:
 *   `.claude/rag/core/code-style-guide.md`
 *   `.claude-context/architecture.md`
 *   `(.claude/context/testing.md)`
 *   **File**: `.claude/rag/core/code-style-guide.md`
 */
function extractReferencedPaths(claudeMdContent: string): string[] {
  const paths = new Set<string>();
  const patterns = [
    // Backtick-wrapped paths: `path/to/file.md`
    /`([^`]*\.md)`/g,
    // Parenthesized paths: (path/to/file.md)
    /\(([^)]*\.md)\)/g,
    // Bare relative paths: ./path or ../path
    /(?:^|\s)(\.\.?\/[\w./-]+\.md)\b/gm,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(claudeMdContent)) !== null) {
      const ref = match[1].trim();
      // Filter out URLs and obviously non-path strings
      if (ref.startsWith('http') || ref.includes(' ') || ref.length > 200) continue;
      // Must look like a relative path (starts with . or a directory name)
      if (ref.startsWith('.') || ref.includes('/')) {
        paths.add(ref);
      }
    }
  }

  return [...paths];
}

/**
 * Discover context directories from referenced paths.
 * E.g., if CLAUDE.md references `.claude/rag/core/file.md`, the context dir is `.claude/rag`.
 */
function discoverContextDirs(referencedPaths: string[]): string[] {
  const dirs = new Set<string>();
  for (const ref of referencedPaths) {
    // Look for known context directory patterns in the path
    // Only recognize .claude/context/ as the active DARC dir.
    // .claude-context/ and .claude/rag/ are legacy and should be migrated.
    const contextPatterns = [
      /^(\.claude\/context)\//,
    ];
    for (const pattern of contextPatterns) {
      const match = ref.match(pattern);
      if (match) {
        dirs.add(match[1]);
        break;
      }
    }
  }
  return [...dirs];
}

async function findContextDir(repoRoot: string, claudeMdContent: string | null): Promise<string | null> {
  // If CLAUDE.md references files, discover the context directory from those references
  if (claudeMdContent) {
    const refs = extractReferencedPaths(claudeMdContent);
    const discoveredDirs = discoverContextDirs(refs);
    // Return the first discovered directory that exists
    for (const dir of discoveredDirs) {
      const absDir = join(repoRoot, dir);
      if (await fileExists(absDir)) return absDir;
    }
  }

  // Fallback: only .claude/context/ is the standard DARC location.
  // .claude-context/ and .claude/rag/ are legacy — not listed here so they get migrated.
  const candidates = [
    join(repoRoot, '.claude', 'context'),
  ];
  for (const dir of candidates) {
    if (await fileExists(dir)) return dir;
  }

  return null;
}

async function loadContextFile(absolutePath: string, repoRoot: string): Promise<ContextFile> {
  const content = await readFile(absolutePath, 'utf-8');
  const { frontmatter } = parseFrontmatter(content);
  const tokens = estimateTokens(content);
  const repoRelative = relative(repoRoot, absolutePath).replace(/\\/g, '/');

  return {
    path: repoRelative,
    absolutePath,
    content,
    tokens,
    frontmatter,
    referenced: false, // will be set by the caller
  };
}

export interface ScanOptions {
  exclude?: string[];
}

export async function scanRepo(repoRoot: string, options?: ScanOptions): Promise<RuleContext> {
  const config = await loadConfig(repoRoot);
  const excludePrefixes = (options?.exclude ?? []).map(p => p.replace(/\/$/, ''));

  const claudeMdPath = await findClaudeMd(repoRoot);
  let claudeMdContent: string | null = null;
  if (claudeMdPath) {
    claudeMdContent = await readFile(claudeMdPath, 'utf-8');
  }

  const contextDir = await findContextDir(repoRoot, claudeMdContent);
  const contextFiles: ContextFile[] = [];
  const loadedPaths = new Set<string>();

  // Step 1: Parse CLAUDE.md to find referenced files
  const referencedRelPaths = claudeMdContent ? extractReferencedPaths(claudeMdContent) : [];
  const referencedAbsPaths = new Set<string>();

  for (const ref of referencedRelPaths) {
    // Skip CLAUDE.md cross-references — they are not context files
    if (/claude\.md$/i.test(ref)) continue;

    // Skip excluded paths
    if (excludePrefixes.some(prefix => ref.startsWith(prefix + '/') || ref === prefix)) continue;

    const absPath = resolve(repoRoot, ref);
    if (await fileExists(absPath)) {
      referencedAbsPaths.add(absPath);
      if (!loadedPaths.has(absPath)) {
        loadedPaths.add(absPath);
        const cf = await loadContextFile(absPath, repoRoot);
        cf.referenced = true;
        contextFiles.push(cf);
      }
    }
  }

  // Step 2: Also follow references from loaded context files (frontmatter.reference)
  for (const cf of contextFiles) {
    if (cf.frontmatter?.reference && typeof cf.frontmatter.reference === 'string') {
      const refAbsPath = resolve(repoRoot, cf.frontmatter.reference);
      // Ensure reference stays inside repo root
      const absRoot = resolve(repoRoot);
      if (!refAbsPath.startsWith(absRoot + '/') && refAbsPath !== absRoot) continue;
      if (!loadedPaths.has(refAbsPath) && (await fileExists(refAbsPath))) {
        loadedPaths.add(refAbsPath);
        const linkedCf = await loadContextFile(refAbsPath, repoRoot);
        linkedCf.referenced = true;
        contextFiles.push(linkedCf);
      }
    }
  }

  // Step 3: Glob context directory for any remaining .md files (potential orphans)
  if (contextDir) {
    const allFiles = await glob('**/*.md', { cwd: contextDir });
    for (const relPath of allFiles) {
      const absolutePath = join(contextDir, relPath);
      if (!loadedPaths.has(absolutePath)) {
        loadedPaths.add(absolutePath);
        const cf = await loadContextFile(absolutePath, repoRoot);
        cf.referenced = false; // Not referenced from CLAUDE.md
        contextFiles.push(cf);
      }
    }
  }

  return {
    repoRoot,
    claudeMdPath,
    claudeMdContent,
    contextDir,
    contextFiles,
    config,
  };
}

// Export for testing
export { extractReferencedPaths, discoverContextDirs };
