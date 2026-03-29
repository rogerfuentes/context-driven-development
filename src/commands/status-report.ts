import pc from 'picocolors';

export interface SpecStatus {
  id: string;
  path: string;
  hasAnalysis: boolean;
  hasPlan: boolean;
  hasSummary: boolean;
  totalSteps: number;
  completedSteps: number;
  permanent: boolean;
  lastModified: Date;
}

export interface StatusResult {
  repoName: string;
  specs: SpecStatus[];
  overall: { total: number; completed: number; percentage: number };
}

function progressBar(completed: number, total: number, width: number = 10): string {
  if (total === 0) return '['+ '-'.repeat(width) + ']';
  const filled = Math.round((completed / total) * width);
  return '[' + '='.repeat(filled) + '-'.repeat(width - filled) + ']';
}

export function formatHumanStatusReport(data: StatusResult): string {
  const lines: string[] = [];
  lines.push(`CDD Status -- ${data.repoName}`);
  lines.push('='.repeat(40));
  lines.push('');

  if (data.specs.length === 0) {
    lines.push('No specs found.');
    lines.push('');
    lines.push('Create one with: /cdd:create <description>');
    return lines.join('\n');
  }

  lines.push(`Specs (${data.specs.length}):`);

  // Find max ID length for alignment
  const maxId = Math.max(...data.specs.map(s => s.id.length));

  for (const spec of data.specs) {
    const bar = progressBar(spec.completedSteps, spec.totalSteps);
    const progress = `${String(spec.completedSteps).padStart(2)}/${String(spec.totalSteps).padEnd(2)} steps`;
    const permanent = spec.permanent ? pc.dim('  (permanent)') : '';
    const color = spec.completedSteps === spec.totalSteps ? pc.green : spec.completedSteps > 0 ? pc.yellow : pc.red;
    lines.push(`  ${spec.id.padEnd(maxId + 2)} ${color(bar)} ${progress}${permanent}`);
  }

  lines.push('');
  const pct = data.overall.total > 0 ? Math.round(data.overall.percentage) : 0;
  lines.push(`Overall: ${data.overall.completed}/${data.overall.total} steps (${pct}%)`);

  // Stale detection: specs not modified in 7+ days
  const now = Date.now();
  const staleSpecs = data.specs.filter(s =>
    s.completedSteps < s.totalSteps && (now - s.lastModified.getTime()) > 7 * 24 * 60 * 60 * 1000
  );
  if (staleSpecs.length > 0) {
    lines.push('');
    lines.push(pc.yellow('Stale specs (no changes in >7 days):'));
    for (const spec of staleSpecs) {
      lines.push(`  ${spec.id}   Last modified: ${spec.lastModified.toISOString().slice(0, 10)}`);
    }
  }

  return lines.join('\n');
}

export function formatJsonStatusReport(data: StatusResult): string {
  return JSON.stringify({
    repo: data.repoName,
    specs: data.specs.map(s => ({
      id: s.id,
      path: s.path,
      hasAnalysis: s.hasAnalysis,
      hasPlan: s.hasPlan,
      hasSummary: s.hasSummary,
      totalSteps: s.totalSteps,
      completedSteps: s.completedSteps,
      permanent: s.permanent,
      lastModified: s.lastModified.toISOString(),
    })),
    overall: data.overall,
  });
}
