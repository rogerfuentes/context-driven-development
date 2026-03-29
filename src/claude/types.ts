export interface InitResult {
  files: Array<{ path: string; action: 'created' | 'updated' | 'skipped'; content?: string }>;
  projectType: string;
  topics: string[];
}

export interface CurateFullResult {
  findings: Array<{
    severity: 'error' | 'warning' | 'info';
    rule: string;
    message: string;
    file?: string;
  }>;
}

export interface BenchmarkResult {
  score: number;
  tokenDistribution: Record<string, { tokens: number; percentage: number }>;
  scenarios: Array<{
    name: string;
    filesLoaded: string[];
  }>;
  fileRoi: Record<string, { roi: number; timesLoaded: number }>;
  deadFiles: string[];
  overloadedFiles: string[];
  progressiveDisclosure: number;
}

export interface TrainResult {
  action: 'create' | 'merge';
  targetFile: string;
  content: string;
  overlap: Array<{ file: string; similarity: number }>;
  claudeMdUpdate?: string;
}
