import pc from 'picocolors';

export interface FileConflict {
  filePath: string;
  streams: string[];
}

export interface ConflictResult {
  specId: string;
  conflicts: FileConflict[];
  safeFiles: Array<{ filePath: string; stream: string }>;
  hasConflicts: boolean;
}

export function formatHumanConflictReport(result: ConflictResult): string {
  const lines: string[] = [];
  lines.push(`Conflict Detection: ${result.specId}`);
  lines.push('='.repeat(40));
  lines.push('');

  if (result.conflicts.length === 0) {
    lines.push(pc.green('No conflicts detected. All files are unique to their streams.'));
    lines.push('');
  } else {
    lines.push(pc.red(`CONFLICTS (${result.conflicts.length} file${result.conflicts.length > 1 ? 's' : ''})`));
    lines.push('');
    for (const conflict of result.conflicts) {
      lines.push(`  ${conflict.filePath}`);
      lines.push(`    Touched by: ${conflict.streams.join(', ')}`);
      lines.push(pc.yellow('    → Lead must own this file'));
      lines.push('');
    }
  }

  if (result.safeFiles.length > 0) {
    lines.push(pc.green(`Safe files (${result.safeFiles.length} unique to one stream)`));
    // Group by stream
    const byStream = new Map<string, string[]>();
    for (const sf of result.safeFiles) {
      const existing = byStream.get(sf.stream) ?? [];
      existing.push(sf.filePath);
      byStream.set(sf.stream, existing);
    }
    for (const [stream, files] of byStream) {
      lines.push(`  ${stream}: ${files.join(', ')}`);
    }
  }

  return lines.join('\n');
}

export function formatJsonConflictReport(result: ConflictResult): string {
  return JSON.stringify({
    specId: result.specId,
    hasConflicts: result.hasConflicts,
    conflicts: result.conflicts,
    safeFiles: result.safeFiles,
  });
}
