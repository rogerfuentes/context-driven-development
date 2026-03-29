import type { Finding, RuleContext } from './rules/types.js';

const SEVERITY_PENALTY: Record<Finding['severity'], number> = {
  error: 10,
  warning: 3,
  info: 0,
};

/**
 * Compute cleanliness sub-score (100 - penalties).
 * Measures how free of issues the existing content is.
 */
export function computeCleanliness(findings: Finding[]): number {
  let score = 100;
  for (const f of findings) {
    score -= SEVERITY_PENALTY[f.severity];
  }
  return Math.max(0, Math.min(100, score));
}

/**
 * Compute completeness sub-score (0-100).
 * Measures whether the expected context artifacts exist and have substance.
 *
 * Checklist (points):
 *   CLAUDE.md exists              +15
 *   CLAUDE.md >= 50 lines         +10
 *   CLAUDE.md has commands table  +10
 *   Context directory exists      +15
 *   >= 3 context files            +15
 *   All context files have frontmatter (name + description)  +10
 *   Progressive disclosure table  +10
 *   No orphan context files       +15
 */
export function computeCompleteness(ctx: RuleContext): number {
  let score = 0;

  // CLAUDE.md exists
  if (ctx.claudeMdContent) {
    score += 15;

    const lines = ctx.claudeMdContent.split('\n').length;
    if (lines >= 50) score += 10;

    // Commands table: look for a markdown table after a "commands" heading
    const lower = ctx.claudeMdContent.toLowerCase();
    if (lower.includes('command') && ctx.claudeMdContent.includes('|')) {
      score += 10;
    }

    // Progressive disclosure table
    if (lower.includes('load when') || lower.includes('when to use')) {
      score += 10;
    }
  }

  // Context directory exists
  if (ctx.contextDir) {
    score += 15;
  }

  // At least 3 context files
  if (ctx.contextFiles.length >= 3) {
    score += 15;
  } else if (ctx.contextFiles.length > 0) {
    // Partial credit: 5 per file, up to 15
    score += Math.min(15, ctx.contextFiles.length * 5);
  }

  // All referenced context files have frontmatter with name + description
  const referencedFiles = ctx.contextFiles.filter((f) => f.referenced);
  if (referencedFiles.length > 0) {
    const withFrontmatter = referencedFiles.filter(
      (f) => f.frontmatter?.name && f.frontmatter?.description,
    );
    if (withFrontmatter.length === referencedFiles.length) {
      score += 10;
    } else {
      // Partial credit based on ratio
      score += Math.round(10 * (withFrontmatter.length / referencedFiles.length));
    }
  }

  // No orphan context files (all files are referenced)
  if (ctx.contextFiles.length > 0) {
    const orphans = ctx.contextFiles.filter((f) => !f.referenced);
    if (orphans.length === 0) {
      score += 15;
    } else {
      // Partial: penalize proportionally
      const orphanRatio = orphans.length / ctx.contextFiles.length;
      score += Math.round(15 * (1 - orphanRatio));
    }
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Compute context quality score as a weighted composite:
 *   completeness (60%) + cleanliness (40%)
 *
 * This ensures repos with no context can't score high (completeness = 0),
 * while repos with lots of context aren't penalized just for having more
 * surface area for findings.
 *
 * When called without a RuleContext (backwards compat), falls back to
 * cleanliness-only scoring.
 */
export function computeScore(findings: Finding[], ctx?: RuleContext): number {
  const cleanliness = computeCleanliness(findings);

  if (!ctx) {
    // Backwards compatibility: cleanliness only
    return cleanliness;
  }

  const completeness = computeCompleteness(ctx);
  const composite = Math.round(completeness * 0.6 + cleanliness * 0.4);
  return Math.max(0, Math.min(100, composite));
}
