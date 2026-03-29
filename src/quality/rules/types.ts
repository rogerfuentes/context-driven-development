export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  severity: Severity;
  rule: string;
  message: string;
  file?: string;
  line?: number;
}

export interface RuleContext {
  repoRoot: string;
  claudeMdPath: string | null;
  claudeMdContent: string | null;
  contextDir: string | null;
  contextFiles: ContextFile[];
  config: CddConfig;
}

export interface ContextFile {
  path: string;
  absolutePath: string;
  content: string;
  tokens: number;
  frontmatter: Frontmatter | null;
  /** Whether this file is referenced from CLAUDE.md or another referenced context file */
  referenced: boolean;
}

export interface Frontmatter {
  name?: string;
  description?: string;
  reference?: string;
  [key: string]: unknown;
}

export interface CddConfig {
  contextDir: string;
  budgets: {
    claudeMd: number;
    perFile: number;
    perFileMin: number;
    perLevel3File: number;
    total: number; // 0 = disabled
  };
  thresholds: {
    jaccardDuplication: number;
    maxAnnotations: number;
    codeToProseRatio: number;
  };
  rules: Record<string, Severity>;
}

export type RuleFn = (ctx: RuleContext) => Finding[];
