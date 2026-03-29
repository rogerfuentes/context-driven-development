import type { Finding, RuleContext, Severity } from './types.js';

function stripCodeBlocks(text: string): string {
  return text.replace(/```[\s\S]*?```/g, (match) =>
    match.split('\n').map(() => '').join('\n'),
  );
}

function findLineNumber(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

interface PatternMatch {
  pattern: RegExp;
  rule: string;
  severity: Severity;
  label: string;
}

const CLARITY_PATTERNS: PatternMatch[] = [
  // Double negatives
  {
    pattern: /\b(?:NOT|not|don't|Don't|doesn't|Doesn't|do not|Do not)\s+(?:avoid|prevent|disable|exclude|reject|ignore)\b/gi,
    rule: 'double-negatives',
    severity: 'warning',
    label: 'double negative',
  },
  // Hedge words
  ...[
    /\byou might want to\b/gi,
    /\bconsider using\b/gi,
    /\byou could\b/gi,
    /\bshould consider\b/gi,
    /\bit might be\b/gi,
    /\bperhaps\b/gi,
  ].map((pattern): PatternMatch => ({ pattern, rule: 'hedge-words', severity: 'warning', label: 'hedge word' })),
  // Open-ended lists
  ...[/\betc\./gi, /\band so on\b/gi, /\band more\b/gi].map(
    (pattern): PatternMatch => ({ pattern, rule: 'open-ended-lists', severity: 'warning', label: 'open-ended list' }),
  ),
  // Passive voice in rules
  ...[/\bshould be used\b/gi, /\bis preferred\b/gi, /\bis recommended\b/gi].map(
    (pattern): PatternMatch => ({ pattern, rule: 'passive-voice-in-rules', severity: 'info', label: 'passive voice in rule' }),
  ),
];

function scanContent(
  content: string,
  filePath: string,
  patterns: PatternMatch[],
): Finding[] {
  const findings: Finding[] = [];

  for (const { pattern, rule, severity, label } of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      findings.push({
        severity,
        rule,
        message: `"${match[0]}" — ${label}`,
        file: filePath,
        line: findLineNumber(content, match.index),
      });
    }
  }

  return findings;
}

export function checkClarity(ctx: RuleContext): Finding[] {
  const findings: Finding[] = [];

  if (ctx.claudeMdContent && ctx.claudeMdPath) {
    const stripped = stripCodeBlocks(ctx.claudeMdContent);
    const filePath = ctx.claudeMdPath.split('/').pop() ?? 'CLAUDE.md';
    findings.push(...scanContent(stripped, filePath, CLARITY_PATTERNS));
  }

  for (const cf of ctx.contextFiles) {
    const stripped = stripCodeBlocks(cf.content);
    findings.push(...scanContent(stripped, cf.path, CLARITY_PATTERNS));
  }

  return findings;
}
