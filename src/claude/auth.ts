/**
 * Claude auth detection.
 *
 * Two supported auth modes:
 *   1. Anthropic direct — ANTHROPIC_API_KEY
 *   2. AWS Bedrock — AWS_BEARER_TOKEN_BEDROCK plus CLAUDE_CODE_USE_BEDROCK=1
 *      (CLAUDE_CODE_USE_BEDROCK is what tells the Claude Code CLI / SDK to
 *      route through Bedrock; without it the bearer token is unused.)
 */

export type AuthMode = 'anthropic' | 'bedrock';

export interface AuthStatus {
  ok: boolean;
  mode?: AuthMode;
  /** Human-readable error message when ok is false. */
  message?: string;
}

const MISSING_AUTH_MESSAGE =
  'Authentication required: set ANTHROPIC_API_KEY, or set both AWS_BEARER_TOKEN_BEDROCK and CLAUDE_CODE_USE_BEDROCK=1 to use Bedrock.';

export function detectAuth(env: NodeJS.ProcessEnv = process.env): AuthStatus {
  if (env.ANTHROPIC_API_KEY) {
    return { ok: true, mode: 'anthropic' };
  }

  const bedrockToken = env.AWS_BEARER_TOKEN_BEDROCK;
  const bedrockEnabled = env.CLAUDE_CODE_USE_BEDROCK === '1';

  if (bedrockToken && bedrockEnabled) {
    return { ok: true, mode: 'bedrock' };
  }

  if (bedrockToken && !bedrockEnabled) {
    return {
      ok: false,
      message:
        'AWS_BEARER_TOKEN_BEDROCK is set but CLAUDE_CODE_USE_BEDROCK=1 is not. Export CLAUDE_CODE_USE_BEDROCK=1 to route through Bedrock.',
    };
  }

  return { ok: false, message: MISSING_AUTH_MESSAGE };
}
