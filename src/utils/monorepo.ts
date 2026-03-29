import { readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { glob } from 'tinyglobby';

export interface MonorepoInfo {
  isMonorepo: boolean;
  workspaceGlobs: string[];
}

export interface PackageInfo {
  /** Package name from package.json */
  name: string;
  /** Absolute path to the package directory */
  path: string;
  /** Relative path from repo root (e.g., "packages/foo") */
  relativePath: string;
  /** Whether this package has a CLAUDE.md */
  hasClaudeMd: boolean;
  /** Whether this package has a context directory */
  hasContextDir: boolean;
}

/**
 * Detect whether the repo root is a monorepo and extract workspace globs.
 */
export async function detectMonorepo(repoRoot: string): Promise<MonorepoInfo> {
  // 1. pnpm-workspace.yaml
  try {
    const content = await readFile(join(repoRoot, 'pnpm-workspace.yaml'), 'utf-8');
    const globs = extractPnpmWorkspaceGlobs(content);
    if (globs.length > 0) return { isMonorepo: true, workspaceGlobs: globs };
  } catch { /* not found */ }

  // 2. package.json workspaces
  try {
    const pkg = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf-8'));
    if (Array.isArray(pkg.workspaces)) {
      return { isMonorepo: true, workspaceGlobs: pkg.workspaces };
    }
    if (pkg.workspaces?.packages && Array.isArray(pkg.workspaces.packages)) {
      return { isMonorepo: true, workspaceGlobs: pkg.workspaces.packages };
    }
  } catch { /* not found */ }

  // 3. lerna.json
  try {
    const lerna = JSON.parse(await readFile(join(repoRoot, 'lerna.json'), 'utf-8'));
    if (Array.isArray(lerna.packages)) {
      return { isMonorepo: true, workspaceGlobs: lerna.packages };
    }
  } catch { /* not found */ }

  return { isMonorepo: false, workspaceGlobs: [] };
}

/**
 * Enumerate all packages in a monorepo given workspace globs.
 */
export async function enumeratePackages(
  repoRoot: string,
  workspaceGlobs: string[],
): Promise<PackageInfo[]> {
  const packages: PackageInfo[] = [];
  const seen = new Set<string>();

  // Resolve globs to directories containing package.json
  for (const pattern of workspaceGlobs) {
    const pkgJsonPattern = pattern.endsWith('/*')
      ? pattern.replace(/\/\*$/, '/*/package.json')
      : `${pattern}/package.json`;

    const matches = await glob([pkgJsonPattern], { cwd: repoRoot, absolute: true });

    for (const pkgJsonPath of matches) {
      const dir = join(pkgJsonPath, '..');
      if (seen.has(dir)) continue;
      seen.add(dir);

      try {
        const pkg = JSON.parse(await readFile(pkgJsonPath, 'utf-8'));
        const relPath = relative(repoRoot, dir);

        const hasClaudeMd = await fileExists(join(dir, 'CLAUDE.md'));
        const hasContextDir =
          (await fileExists(join(dir, '.claude', 'context'))) ||
          (await fileExists(join(dir, '.claude-context')));

        packages.push({
          name: pkg.name ?? relPath,
          path: dir,
          relativePath: relPath,
          hasClaudeMd,
          hasContextDir,
        });
      } catch {
        // Skip packages with invalid package.json
      }
    }
  }

  return packages.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

/**
 * Parse workspace globs from pnpm-workspace.yaml content.
 * Simple YAML parsing — handles the common `packages:` list format.
 */
function extractPnpmWorkspaceGlobs(content: string): string[] {
  const globs: string[] = [];
  let inPackages = false;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === 'packages:') {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      if (trimmed.startsWith('- ')) {
        globs.push(trimmed.slice(2).replace(/['"`]/g, '').trim());
      } else if (trimmed && !trimmed.startsWith('#')) {
        // New top-level key — stop
        break;
      }
    }
  }

  return globs;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
