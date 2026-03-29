import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

import { execa } from 'execa';
import { glob } from 'tinyglobby';

import type { LearnOptions } from './learn.js';

export interface SourceResult {
  /** The assembled source material for Claude */
  content: string;
  /** Label describing the source type for logging */
  label: string;
}

/**
 * Gather source material for the learn command.
 *
 * Resolution order:
 *   1. --session <id>   → read Claude Code session transcript
 *   2. --file <path>    → read a local file
 *   3. --url <url>      → fetch remote content
 *   4. (default)        → git diff + recent commits
 *
 * The positional `prompt` arg is always appended as a focus instruction
 * telling Claude what to extract from the source material.
 */
export async function gatherSource(
  options: LearnOptions,
  repoRoot: string,
): Promise<SourceResult> {
  let source: SourceResult;

  if (options.session) {
    source = await getSessionSource(options.session);
  } else if (options.file) {
    source = await getFileSource(options.file, repoRoot);
  } else if (options.url) {
    source = await getUrlSource(options.url);
  } else {
    source = await getGitDiffSource(repoRoot);
  }

  // If a prompt is provided, append it as a focus instruction
  if (options.prompt) {
    source.content += `\n\n=== Focus Instruction ===\n${options.prompt}\n\nExtract knowledge specifically related to the instruction above. Use the source material as context, but focus your extraction on what the instruction asks for.`;
    source.label += ` + prompt`;
  }

  return source;
}

// ---------------------------------------------------------------------------
// Session source — reads Claude Code JSONL transcripts
// ---------------------------------------------------------------------------

async function getSessionSource(sessionId: string): Promise<SourceResult> {
  const home = homedir();
  const projectsDir = join(home, '.claude', 'projects');

  // Session files are stored as <session-uuid>.jsonl under project directories
  const pattern = `**/${sessionId}*.jsonl`;
  const matches = await glob([pattern], { cwd: projectsDir, absolute: true });

  if (matches.length === 0) {
    throw new Error(
      `Session "${sessionId}" not found in ~/.claude/projects/. ` +
      `Use a full or partial session UUID. List sessions with: ls ~/.claude/projects/*/`,
    );
  }

  // Take the newest transcript by mtime if multiple matches
  const withMtime = await Promise.all(
    matches.map(async (file) => ({ file, mtimeMs: (await stat(file)).mtimeMs })),
  );
  withMtime.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const sessionFile = withMtime[0].file;
  const raw = await readFile(sessionFile, 'utf-8');
  const lines = raw.trim().split('\n');

  const messages: string[] = [];
  let messageCount = 0;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);

      // Only include user and assistant conversation messages
      if (entry.type !== 'user' && entry.type !== 'assistant') continue;
      if (!entry.message?.content) continue;

      const role = entry.message.role === 'user' ? 'USER' : 'ASSISTANT';
      const contentParts: string[] = [];

      for (const block of entry.message.content) {
        if (typeof block === 'string') {
          contentParts.push(block);
        } else if (block.type === 'text') {
          contentParts.push(block.text);
        } else if (block.type === 'tool_use') {
          contentParts.push(`[Tool: ${block.name}]`);
        } else if (block.type === 'tool_result') {
          // Skip tool results to keep size manageable
          continue;
        }
      }

      const text = contentParts.join('\n').trim();
      if (text) {
        messages.push(`[${role}]\n${text}`);
        messageCount++;
      }
    } catch {
      // Skip malformed lines
    }
  }

  if (messages.length === 0) {
    throw new Error(`Session "${sessionId}" found but contains no conversation messages.`);
  }

  let transcript = messages.join('\n\n---\n\n');

  // Cap at ~50K chars to avoid overwhelming the prompt
  if (transcript.length > 50_000) {
    transcript = transcript.slice(0, 50_000)
      + `\n\n[...truncated — ${messageCount} messages total, ${raw.length} chars]`;
  }

  return {
    content: `=== Claude Code Session: ${sessionId} ===\n\n${transcript}`,
    label: `session (${messageCount} messages)`,
  };
}

// ---------------------------------------------------------------------------
// File source
// ---------------------------------------------------------------------------

async function getFileSource(filePath: string, repoRoot: string): Promise<SourceResult> {
  const fullPath = isAbsolute(filePath) ? filePath : join(repoRoot, filePath);

  try {
    let content = await readFile(fullPath, 'utf-8');

    // Cap at ~50K chars to match other sources
    if (content.length > 50_000) {
      content = content.slice(0, 50_000) + `\n\n[...truncated — ${content.length} chars total]`;
    }

    return {
      content: `=== File: ${filePath} ===\n\n${content}`,
      label: `file (${filePath})`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    throw new Error(`Cannot read file "${filePath}": ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// URL source
// ---------------------------------------------------------------------------

async function getUrlSource(url: string): Promise<SourceResult> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'cdd-cli/1.0.0' },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    let content = await response.text();

    // Cap at ~50K chars
    if (content.length > 50_000) {
      content = content.slice(0, 50_000) + `\n\n[...truncated — ${content.length} chars total]`;
    }

    return {
      content: `=== URL: ${url} ===\n\n${content}`,
      label: `url (${url})`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    throw new Error(`Cannot fetch URL "${url}": ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Git diff source (default)
// ---------------------------------------------------------------------------

async function getGitDiffSource(repoRoot: string): Promise<SourceResult> {
  const parts: string[] = [];

  // Staged changes
  try {
    const staged = await execa('git', ['diff', '--cached', '--stat'], { cwd: repoRoot });
    if (staged.stdout.trim()) {
      const stagedDiff = await execa('git', ['diff', '--cached'], { cwd: repoRoot });
      parts.push('=== Staged Changes ===\n' + stagedDiff.stdout);
    }
  } catch { /* no staged changes */ }

  // Unstaged changes
  try {
    const unstaged = await execa('git', ['diff', '--stat'], { cwd: repoRoot });
    if (unstaged.stdout.trim()) {
      const unstagedDiff = await execa('git', ['diff'], { cwd: repoRoot });
      parts.push('=== Unstaged Changes ===\n' + unstagedDiff.stdout);
    }
  } catch { /* no unstaged changes */ }

  // Recent commits (last 3)
  try {
    const log = await execa('git', ['log', '--oneline', '-3', '--format=%H %s'], { cwd: repoRoot });
    if (log.stdout.trim()) {
      const commits = log.stdout.trim().split('\n');
      for (const commit of commits) {
        const hash = commit.split(' ')[0];
        const diffResult = await execa('git', ['diff', `${hash}^..${hash}`, '--stat'], { cwd: repoRoot });
        parts.push(`=== Commit: ${commit} ===\n${diffResult.stdout}`);
      }
    }
  } catch { /* no commits or shallow clone */ }

  if (parts.length === 0) {
    return {
      content: 'No git changes found. Working directory is clean with no recent commits.',
      label: 'git diff (clean)',
    };
  }

  let combined = parts.join('\n\n');

  // Cap at ~10K chars
  if (combined.length > 10_000) {
    combined = combined.slice(0, 10_000) + `\n\n[...truncated — full diff is ${combined.length} chars]`;
  }

  return {
    content: combined,
    label: 'git diff',
  };
}
