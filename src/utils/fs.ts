import { access, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

/**
 * Resolve a relative path within a root directory, rejecting traversal attempts.
 * Throws if the resolved path escapes the root.
 */
export function safePath(root: string, relativePath: string): string {
  const resolved = resolve(root, relativePath);
  if (!resolved.startsWith(resolve(root) + '/') && resolved !== resolve(root)) {
    throw new Error(`Path "${relativePath}" escapes repository root`);
  }
  return resolved;
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
