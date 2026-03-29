import { query, AbortError } from '@anthropic-ai/claude-agent-sdk';
import { execa } from 'execa';
import pc from 'picocolors';

export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'dontAsk' | 'bypassPermissions';

export interface ClaudeRunnerOptions {
  prompt: string;
  cwd?: string;
  timeout?: number;
  verbose?: boolean;
  claudePath?: string;
  allowedTools?: string[];
  permissionMode?: PermissionMode;
}

export interface ClaudeResult {
  output: string;
  exitCode: number;
  duration: number;
}

export class ClaudeRunnerError extends Error {
  override readonly name = 'ClaudeRunnerError';

  constructor(
    message: string,
    public readonly exitCode: number,
    public readonly stderr: string,
  ) {
    super(message);
  }
}

const DEFAULT_TIMEOUT = 300_000; // 5 minutes

const installedCache = new Map<string, boolean>();

/**
 * Check whether the Claude CLI is available.
 * The result is cached per claudePath for the lifetime of the process.
 */
export async function checkClaudeInstalled(claudePath = 'claude'): Promise<boolean> {
  const cached = installedCache.get(claudePath);
  if (cached !== undefined) return cached;

  try {
    await execa(claudePath, ['--version'], { timeout: 10_000 });
    installedCache.set(claudePath, true);
    return true;
  } catch {
    installedCache.set(claudePath, false);
    return false;
  }
}

/** Reset the installation cache (for testing). */
export function resetInstallCache(): void {
  installedCache.clear();
}

/**
 * Run a prompt through `claude -p` and return the result.
 */
export async function run(options: ClaudeRunnerOptions): Promise<ClaudeResult> {
  const {
    prompt,
    cwd,
    timeout = DEFAULT_TIMEOUT,
    verbose = false,
    claudePath = 'claude',
  } = options;

  if (!(await checkClaudeInstalled(claudePath))) {
    throw new ClaudeRunnerError('Claude CLI not found. Install from https://claude.ai/code', 3, '');
  }

  const args = ['-p', '--output-format', 'text'];

  if (options.permissionMode) {
    args.push('--permission-mode', options.permissionMode);
  }

  if (options.allowedTools && options.allowedTools.length > 0) {
    args.push('--allowedTools', ...options.allowedTools);
  }

  if (verbose) {
    console.error(pc.dim(`$ ${claudePath} ${args.join(' ')} (cwd: ${cwd ?? process.cwd()})`));
  }

  const start = Date.now();
  const child = execa(claudePath, args, { input: prompt, cwd, timeout, reject: false });
  const onSigint = (): void => { child.kill('SIGINT'); };

  process.on('SIGINT', onSigint);
  try {
    const result = await child;
    const duration = Date.now() - start;

    if (result.timedOut) {
      throw new ClaudeRunnerError(`Claude timed out after ${timeout}ms`, 1, result.stderr);
    }

    const exitCode = result.exitCode ?? 1;
    if (exitCode !== 0) {
      throw new ClaudeRunnerError(
        `Claude exited with code ${exitCode}: ${result.stderr || result.stdout}`,
        exitCode,
        result.stderr,
      );
    }

    return { output: result.stdout, exitCode: 0, duration };
  } finally {
    process.removeListener('SIGINT', onSigint);
  }
}

// ---------------------------------------------------------------------------
// Agent SDK runner — full Claude session with tool access
// ---------------------------------------------------------------------------

export interface AgentRunnerOptions {
  prompt: string;
  systemPrompt?: string;
  cwd?: string;
  timeout?: number;
  verbose?: boolean;
  model?: string;
  maxTurns?: number;
}

/**
 * Run a prompt through the Claude Agent SDK's `query()`.
 * Unlike `run()` (which uses `claude -p`), this spawns a full Claude session
 * with tool access (Read, Grep, Glob, Bash). The agent can make multiple tool
 * calls and iterate on findings.
 */
export async function runAgent(options: AgentRunnerOptions): Promise<ClaudeResult> {
  const {
    prompt,
    systemPrompt,
    cwd,
    timeout = DEFAULT_TIMEOUT,
    verbose = false,
    model = 'claude-sonnet-4-6',
  } = options;

  // eslint-disable-next-line turbo/no-undeclared-env-vars -- runtime requirement, not build dependency
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ClaudeRunnerError(
      'ANTHROPIC_API_KEY is required for agent mode. Set it in your environment.',
      3,
      '',
    );
  }

  if (verbose) {
    console.error(pc.dim(`$ query({ model: ${model}, cwd: ${cwd ?? process.cwd()} })`));
  }

  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), timeout);
  const start = Date.now();

  try {
    const result = query({
      prompt,
      options: {
        abortController,
        cwd: cwd ?? process.cwd(),
        tools: { type: 'preset', preset: 'claude_code' },
        permissionMode: 'bypassPermissions',
        model,
        systemPrompt: systemPrompt
          ? { type: 'preset', preset: 'claude_code', append: systemPrompt }
          : undefined,
      },
    });

    let finalResult = '';
    let longestAssistantText = '';

    for await (const message of result) {
      // Extract final result text on success
      if (
        message.type === 'result' &&
        'subtype' in message &&
        (message as Record<string, unknown>).subtype === 'success'
      ) {
        finalResult = 'result' in message ? String((message as Record<string, unknown>).result) : '';
      }

      // Track longest assistant text block as fallback
      if (message.type === 'assistant') {
        const msg = message as {
          message?: { content?: Array<{ type: string; text?: string }> };
        };
        if (msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
              if (block.text.length > longestAssistantText.length) {
                longestAssistantText = block.text;
              }
            }
          }
        }
      }
    }

    const duration = Date.now() - start;
    const output = finalResult || longestAssistantText;

    return { output, exitCode: 0, duration };
  } catch (error) {
    if (error instanceof AbortError || (error instanceof Error && error.name === 'AbortError')) {
      throw new ClaudeRunnerError(`Claude agent timed out after ${timeout}ms`, 1, '');
    }

    const message = error instanceof Error ? error.message : 'Unknown agent error';
    throw new ClaudeRunnerError(message, 1, '');
  } finally {
    clearTimeout(timer);
  }
}
