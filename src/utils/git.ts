import { access } from 'node:fs/promises';
import { join, dirname } from 'node:path';

export async function findRepoRoot(startDir: string = process.cwd()): Promise<string> {
  let dir = startDir;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await access(join(dir, '.git'));
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) {
        throw new Error('Not inside a git repository');
      }
      dir = parent;
    }
  }
}
