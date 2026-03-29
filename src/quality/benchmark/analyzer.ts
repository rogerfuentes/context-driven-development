import { estimateTokens } from '../token-counter.js';
import type { RuleContext } from '../rules/types.js';

export interface TokenAnalysis {
  claudeMd: { tokens: number; percentage: number } | null;
  files: Record<string, { tokens: number; percentage: number }>;
  total: number;
  budgetUsage: number;
}

export function analyzeTokens(ctx: RuleContext): TokenAnalysis {
  let total = 0;
  const fileCounts: Record<string, number> = {};

  // Count CLAUDE.md tokens
  let claudeMdTokens = 0;
  if (ctx.claudeMdContent) {
    claudeMdTokens = estimateTokens(ctx.claudeMdContent);
    total += claudeMdTokens;
  }

  // Count only referenced (active) context file tokens
  for (const cf of ctx.contextFiles) {
    if (cf.referenced) {
      fileCounts[cf.path] = cf.tokens;
      total += cf.tokens;
    }
  }

  // Build file distribution with percentages
  const files: Record<string, { tokens: number; percentage: number }> = {};
  for (const [path, tokens] of Object.entries(fileCounts)) {
    files[path] = {
      tokens,
      percentage: total > 0 ? (tokens / total) * 100 : 0,
    };
  }

  const claudeMd = ctx.claudeMdContent
    ? {
        tokens: claudeMdTokens,
        percentage: total > 0 ? (claudeMdTokens / total) * 100 : 0,
      }
    : null;

  const budgetUsage = ctx.config.budgets.total > 0
    ? (total / ctx.config.budgets.total) * 100
    : 0;

  return { claudeMd, files, total, budgetUsage };
}
