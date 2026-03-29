import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { glob } from 'tinyglobby';

import type { Finding, RuleContext } from './types.js';

interface Annotation {
  sourceFile: string;
  targetPath: string;
  normalizedTarget: string;
  line: number;
}

const ANNOTATION_PATTERN = /^(?:\/\/|#|--)\s*@context:\s*(.+)$/;

const GENERATED_PATTERNS = [
  /__generated__\//,
  /\/dist\//,
  /\/build\//,
  /\.generated\.ts$/,
  /\.gen\.ts$/,
  /\.d\.ts$/,
];

function isGeneratedFile(path: string): boolean {
  return GENERATED_PATTERNS.some((p) => p.test(path));
}

export async function checkAnnotations(ctx: RuleContext): Promise<Finding[]> {
  const findings: Finding[] = [];
  const { thresholds } = ctx.config;

  const sourceFiles = await glob(
    '**/*.{ts,tsx,js,jsx,py,sql,rs,go,rb,java,kt,swift}',
    {
      cwd: ctx.repoRoot,
      ignore: ['node_modules/**', 'dist/**', 'build/**', '.next/**', 'coverage/**'],
    },
  );

  const annotations: Annotation[] = [];

  for (const relPath of sourceFiles) {
    const absPath = join(ctx.repoRoot, relPath);
    let content: string;
    try {
      content = await readFile(absPath, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split('\n').slice(0, 5);
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(ANNOTATION_PATTERN);
      if (match) {
        const targetPath = match[1].trim();
        annotations.push({
          sourceFile: relPath,
          targetPath,
          normalizedTarget: targetPath.replace(/^\.\//, ''),
          line: i + 1,
        });
      }
    }
  }

  const contextFilePaths = new Set(ctx.contextFiles.map((f) => f.path));
  for (const ann of annotations) {
    if (!contextFilePaths.has(ann.targetPath) && !contextFilePaths.has(ann.normalizedTarget)) {
      findings.push({
        severity: 'error',
        rule: 'annotation-target-exists',
        message: `@context in ${ann.sourceFile}:${ann.line} references "${ann.targetPath}" — file does not exist`,
        file: ann.sourceFile,
        line: ann.line,
      });
    }
  }

  if (annotations.length > thresholds.maxAnnotations) {
    findings.push({
      severity: 'warning',
      rule: 'annotation-count',
      message: `Found ${annotations.length} @context annotations (threshold: ${thresholds.maxAnnotations})`,
    });
  }

  const targetCounts = new Map<string, string[]>();
  for (const ann of annotations) {
    const sources = targetCounts.get(ann.normalizedTarget) ?? [];
    sources.push(ann.sourceFile);
    targetCounts.set(ann.normalizedTarget, sources);
  }
  for (const [target, sources] of targetCounts) {
    if (sources.length > 1) {
      findings.push({
        severity: 'warning',
        rule: 'annotation-duplicate-target',
        message: `Multiple annotations point to "${target}" from: ${sources.join(', ')}`,
      });
    }
  }

  for (const ann of annotations) {
    if (isGeneratedFile(ann.sourceFile)) {
      findings.push({
        severity: 'warning',
        rule: 'annotation-in-generated',
        message: `@context annotation found in generated file ${ann.sourceFile}:${ann.line}`,
        file: ann.sourceFile,
        line: ann.line,
      });
    }
  }

  for (const ann of annotations) {
    const cf = ctx.contextFiles.find(
      (f) => f.path === ann.normalizedTarget || f.path === ann.targetPath,
    );
    if (cf && cf.tokens > ctx.config.budgets.perLevel3File) {
      findings.push({
        severity: 'info',
        rule: 'annotation-file-budget',
        message: `${cf.path} referenced by @context is ${cf.tokens} tokens (Level 3 budget: ${ctx.config.budgets.perLevel3File})`,
        file: cf.path,
      });
    }
  }

  return findings;
}
