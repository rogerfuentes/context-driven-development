import pc from 'picocolors';

import { getScoreColor } from './format-utils.js';
import type { Finding, RuleContext } from './rules/types.js';
import { estimateTokens } from './token-counter.js';

export interface ReportData {
  repoName: string;
  score: number;
  findings: Finding[];
  ctx: RuleContext;
}

export function formatHumanReport(data: ReportData): string {
  const { repoName, score, findings, ctx } = data;
  const lines: string[] = [];

  lines.push(`CDD Curate Report -- ${repoName}`);
  lines.push('='.repeat(40));
  lines.push('');

  // Score
  const scoreColor = getScoreColor(score);
  lines.push(`Score: ${scoreColor(`${score}/100`)}`);
  lines.push('');

  // Group findings by severity
  const severitySections: Array<{
    severity: Finding['severity'];
    heading: string;
    icon: string;
    colorFn: (text: string) => string;
  }> = [
    { severity: 'error', heading: 'ERRORS', icon: 'x', colorFn: pc.red },
    { severity: 'warning', heading: 'WARNINGS', icon: '!', colorFn: pc.yellow },
    { severity: 'info', heading: 'INFO', icon: 'i', colorFn: pc.dim },
  ];

  for (const { severity, heading, icon, colorFn } of severitySections) {
    const group = findings.filter((f) => f.severity === severity);
    if (group.length === 0) continue;

    lines.push(colorFn(`${heading} (${group.length}):`));
    for (const f of group) {
      const loc = f.line ? `:${f.line}` : '';
      const fileStr = f.file ? ` [${f.file}${loc}]` : '';
      lines.push(`  ${colorFn(icon)} ${f.message}${fileStr}`);
    }
    lines.push('');
  }

  if (findings.length === 0) {
    lines.push(pc.green('No issues found!'));
    lines.push('');
  }

  // Token budget summary
  lines.push('Token Budget:');
  if (ctx.claudeMdContent) {
    const claudeTokens = estimateTokens(ctx.claudeMdContent);
    const claudeBudget = ctx.config.budgets.claudeMd;
    const claudeColor = claudeTokens > claudeBudget ? pc.yellow : pc.green;
    lines.push(`  CLAUDE.md: ${claudeColor(`${claudeTokens.toLocaleString()} / ${claudeBudget.toLocaleString()}`)}`);
  }

  const claudeMdTokens = ctx.claudeMdContent ? estimateTokens(ctx.claudeMdContent) : 0;
  const totalTokens = claudeMdTokens + ctx.contextFiles.reduce((sum, cf) => sum + cf.tokens, 0);
  const totalBudget = ctx.config.budgets.total;
  const totalColor = totalTokens > totalBudget ? pc.yellow : pc.green;
  lines.push(`  Total: ${totalColor(`${totalTokens.toLocaleString()} / ${totalBudget.toLocaleString()}`)}`);

  for (const cf of ctx.contextFiles) {
    const budget = ctx.config.budgets.perFile;
    const color = cf.tokens > budget ? pc.yellow : pc.dim;
    lines.push(`  ${cf.path}: ${color(`${cf.tokens.toLocaleString()} / ${budget.toLocaleString()}`)}`);
  }

  return lines.join('\n');
}

export function formatJsonReport(data: ReportData): string {
  const { repoName, score, findings, ctx } = data;

  const perFile = Object.fromEntries(
    ctx.contextFiles.map((cf) => [
      cf.path,
      { actual: cf.tokens, budget: ctx.config.budgets.perFile },
    ]),
  );

  const report = {
    repo: repoName,
    score,
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    findings: findings.map(({ severity, rule, message, file, line }) => ({
      severity,
      rule,
      message,
      ...(file && { file }),
      ...(line && { line }),
    })),
    tokenBudget: {
      claudeMd: ctx.claudeMdContent
        ? {
            actual: estimateTokens(ctx.claudeMdContent),
            budget: ctx.config.budgets.claudeMd,
          }
        : null,
      total: {
        actual: (ctx.claudeMdContent ? estimateTokens(ctx.claudeMdContent) : 0) +
          ctx.contextFiles.reduce((sum, cf) => sum + cf.tokens, 0),
        budget: ctx.config.budgets.total,
      },
      perFile,
    },
  };

  return JSON.stringify(report, null, 2);
}
