import { resolve } from 'node:path';

import { fileExists } from '../../utils/fs.js';
import type { Finding, RuleContext } from './types.js';

export function checkStructure(ctx: RuleContext): Finding[] {
  const findings: Finding[] = [];

  if (!ctx.claudeMdContent) {
    findings.push({
      severity: 'error',
      rule: 'claude-md-exists',
      message: 'CLAUDE.md does not exist in the repository root',
    });
  } else {
    const lines = ctx.claudeMdContent.split('\n').length;
    if (lines < 50) {
      findings.push({
        severity: 'error',
        rule: 'claude-md-exists',
        message: `CLAUDE.md is trivial (${lines} lines, minimum 50)`,
        file: 'CLAUDE.md',
      });
    }
  }

  if (!ctx.contextDir) {
    findings.push({
      severity: 'warning',
      rule: 'context-dir-exists',
      message: 'No context directory found (.claude/context/ or .claude-context/)',
    });
  }

  // Frontmatter checks are info-level for now. Frontmatter is a DARC-specific pattern
  // and not all repos have adopted it yet. Once repos are migrated to use DARC, this
  // should be promoted to warning severity (or gated behind --evaluate-darc flag).
  for (const cf of ctx.contextFiles) {
    if (!cf.referenced) continue;
    if (!cf.frontmatter) {
      findings.push({
        severity: 'info',
        rule: 'frontmatter-valid',
        message: `${cf.path} is missing YAML frontmatter`,
        file: cf.path,
      });
      continue;
    }
    if (!cf.frontmatter.name) {
      findings.push({
        severity: 'info',
        rule: 'frontmatter-valid',
        message: `${cf.path} frontmatter is missing "name" field`,
        file: cf.path,
      });
    }
    if (!cf.frontmatter.description) {
      findings.push({
        severity: 'info',
        rule: 'frontmatter-valid',
        message: `${cf.path} frontmatter is missing "description" field`,
        file: cf.path,
      });
    }
  }

  if (ctx.claudeMdContent) {
    const lower = ctx.claudeMdContent.toLowerCase();
    const hasTable =
      lower.includes('load when') ||
      lower.includes('when to use');
    if (!hasTable && ctx.contextFiles.length > 0) {
      findings.push({
        severity: 'warning',
        rule: 'progressive-disclosure',
        message: 'CLAUDE.md has no progressive disclosure table with "Load when" triggers',
        file: 'CLAUDE.md',
      });
    }
  }

  return findings;
}

export async function checkStructureAsync(ctx: RuleContext): Promise<Finding[]> {
  const findings = checkStructure(ctx);

  if (ctx.claudeMdContent) {
    const refPatterns = [
      /\b(?:@|\.\/|\.\.\/)([\w./-]+\.md)\b/g,
      /\(([^)]*\.md)\)/g,
    ];

    const checkedRefs = new Set<string>();
    for (const pattern of refPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(ctx.claudeMdContent)) !== null) {
        const ref = match[1];
        if (checkedRefs.has(ref)) continue;
        checkedRefs.add(ref);

        const refPath = resolve(ctx.repoRoot, ref);
        if (!(await fileExists(refPath))) {
          findings.push({
            severity: 'error',
            rule: 'broken-reference',
            message: `CLAUDE.md references ${ref} — file does not exist`,
            file: 'CLAUDE.md',
          });
        }
      }
    }
  }

  for (const cf of ctx.contextFiles) {
    if (cf.frontmatter?.reference) {
      const refPath = resolve(ctx.repoRoot, cf.frontmatter.reference);
      if (!(await fileExists(refPath))) {
        findings.push({
          severity: 'error',
          rule: 'reference-chain-valid',
          message: `${cf.path} frontmatter references "${cf.frontmatter.reference}" — file does not exist`,
          file: cf.path,
        });
      }
    }
  }

  // Flag orphan files — use the referenced flag set by the scanner
  for (const cf of ctx.contextFiles) {
    if (!cf.referenced) {
      findings.push({
        severity: 'warning',
        rule: 'orphan-files',
        message: `${cf.path} is not referenced by CLAUDE.md or other context files — wasted tokens`,
        file: cf.path,
      });
    }
  }

  return findings;
}
