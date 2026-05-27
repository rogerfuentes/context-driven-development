import { describe, it, expect } from 'vitest';

import { detectAuth } from '../../src/claude/auth.js';

describe('detectAuth', () => {
  it('returns ok=true with mode=anthropic when ANTHROPIC_API_KEY is set', () => {
    const result = detectAuth({ ANTHROPIC_API_KEY: 'sk-ant-...' });
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('anthropic');
  });

  it('prefers Anthropic auth over Bedrock when both are present', () => {
    const result = detectAuth({
      ANTHROPIC_API_KEY: 'sk-ant-...',
      AWS_BEARER_TOKEN_BEDROCK: 'aws-token',
      CLAUDE_CODE_USE_BEDROCK: '1',
    });
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('anthropic');
  });

  it('returns ok=true with mode=bedrock when bearer token + CLAUDE_CODE_USE_BEDROCK=1', () => {
    const result = detectAuth({
      AWS_BEARER_TOKEN_BEDROCK: 'aws-token',
      CLAUDE_CODE_USE_BEDROCK: '1',
    });
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('bedrock');
  });

  it('rejects Bedrock token without CLAUDE_CODE_USE_BEDROCK=1', () => {
    const result = detectAuth({ AWS_BEARER_TOKEN_BEDROCK: 'aws-token' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('CLAUDE_CODE_USE_BEDROCK');
  });

  it('rejects Bedrock token when CLAUDE_CODE_USE_BEDROCK is set to a non-1 value', () => {
    const result = detectAuth({
      AWS_BEARER_TOKEN_BEDROCK: 'aws-token',
      CLAUDE_CODE_USE_BEDROCK: 'true',
    });
    expect(result.ok).toBe(false);
  });

  it('returns ok=false with helpful message when nothing is set', () => {
    const result = detectAuth({});
    expect(result.ok).toBe(false);
    expect(result.message).toContain('ANTHROPIC_API_KEY');
    expect(result.message).toContain('AWS_BEARER_TOKEN_BEDROCK');
    expect(result.message).toContain('CLAUDE_CODE_USE_BEDROCK');
  });
});
