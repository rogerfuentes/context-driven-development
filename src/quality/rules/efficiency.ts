import { estimateTokens } from '../token-counter.js';
import type { Finding, RuleContext } from './types.js';

function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

export function checkEfficiency(ctx: RuleContext): Finding[] {
  const findings: Finding[] = [];
  const { budgets, thresholds } = ctx.config;

  if (ctx.claudeMdContent) {
    const tokens = estimateTokens(ctx.claudeMdContent);
    if (tokens > budgets.claudeMd) {
      findings.push({
        severity: 'warning',
        rule: 'claude-md-budget',
        message: `CLAUDE.md is ${tokens.toLocaleString()} tokens (budget: ${budgets.claudeMd.toLocaleString()})`,
        file: 'CLAUDE.md',
      });
    }
  }

  // Only check budgets for referenced (active) context files
  const activeFiles = ctx.contextFiles.filter((cf) => cf.referenced);

  for (const cf of activeFiles) {
    if (cf.tokens > budgets.perFile) {
      findings.push({
        severity: 'warning',
        rule: 'per-file-budget',
        message: `${cf.path} is ${cf.tokens.toLocaleString()} tokens (budget: ${budgets.perFile.toLocaleString()})`,
        file: cf.path,
      });
    }
    if (budgets.perFileMin > 0 && cf.tokens < budgets.perFileMin) {
      findings.push({
        severity: 'info',
        rule: 'per-file-min',
        message: `${cf.path} is ${cf.tokens.toLocaleString()} tokens — may be too thin for a standalone file (min: ${budgets.perFileMin.toLocaleString()})`,
        file: cf.path,
      });
    }
  }

  // Total budget: info-level metric only (progressive disclosure makes hard limits irrelevant)
  const claudeMdTokens = ctx.claudeMdContent ? estimateTokens(ctx.claudeMdContent) : 0;
  const totalTokens = claudeMdTokens + activeFiles.reduce((sum, cf) => sum + cf.tokens, 0);
  if (budgets.total > 0 && totalTokens > budgets.total) {
    findings.push({
      severity: 'info',
      rule: 'total-budget',
      message: `Total context if all files loaded: ${totalTokens.toLocaleString()} tokens (budget: ${budgets.total.toLocaleString()})`,
    });
  }

  for (let i = 0; i < activeFiles.length; i++) {
    for (let j = i + 1; j < activeFiles.length; j++) {
      const a = activeFiles[i];
      const b = activeFiles[j];
      const similarity = jaccardSimilarity(a.content, b.content);
      if (similarity > thresholds.jaccardDuplication) {
        const pct = Math.round(similarity * 100);
        findings.push({
          severity: 'warning',
          rule: 'content-duplication',
          message: `${a.path} + ${b.path}: ${pct}% content overlap`,
        });
      }
    }
  }

  return findings;
}
