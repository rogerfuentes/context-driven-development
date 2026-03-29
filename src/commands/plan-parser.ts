export interface ParallelStream {
  name: string;
  steps: string[];
  files: string[];
  dependencies: string[];
}

export interface ParallelAnalysis {
  canParallelize: boolean;
  streams: ParallelStream[];
  sharedContracts: string[];
  executionOrder: string[];
}

/**
 * Parse the parallel analysis section from a plan.md file.
 * Tolerant of formatting variations since plan.md is LLM-generated.
 */
export function parseParallelAnalysis(content: string): ParallelAnalysis {
  const result: ParallelAnalysis = {
    canParallelize: false,
    streams: [],
    sharedContracts: [],
    executionOrder: [],
  };

  // Find "Can parallelize?" answer
  const canParMatch = content.match(/can\s+parallelize\??\s*\n+\s*(yes|no)/i);
  if (!canParMatch || canParMatch[1].toLowerCase() === 'no') {
    return result;
  }
  result.canParallelize = true;

  // Parse Parallel Streams table
  result.streams = parseStreamsTable(content);

  // Parse Shared Contracts (code blocks under that heading)
  result.sharedContracts = parseSharedContracts(content);

  // Parse Execution Order (numbered/bulleted list under that heading)
  result.executionOrder = parseExecutionOrder(content);

  return result;
}

/**
 * Parse a markdown table under "Parallel Streams" or "Streams" heading.
 */
function parseStreamsTable(content: string): ParallelStream[] {
  // Find the table section
  const tableMatch = content.match(
    /(?:parallel\s+streams|streams)\s*\n\s*\|(.+)\|\s*\n\s*\|[-\s|]+\|\s*\n((?:\s*\|.+\|\s*\n?)*)/i,
  );
  if (!tableMatch) return [];

  const headerLine = tableMatch[1];
  const bodyText = tableMatch[2];

  // Parse header columns
  const headers = headerLine.split('|').map((h) => h.trim().toLowerCase());

  // Map column indices
  const nameIdx = headers.findIndex((h) => h === 'stream' || h === 'name');
  const stepsIdx = headers.findIndex((h) => h === 'steps' || h === 'step');
  const filesIdx = headers.findIndex((h) => h === 'files' || h === 'file');
  const depsIdx = headers.findIndex((h) => h.includes('depend') || h === 'deps');

  if (nameIdx === -1) return [];

  const streams: ParallelStream[] = [];
  const rows = bodyText.trim().split('\n');

  for (const row of rows) {
    if (!row.trim()) continue;
    // Strip leading/trailing pipe and split
    const cells = row
      .replace(/^\s*\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map((c) => c.trim());

    const name = cells[nameIdx] ?? '';
    if (!name) continue;

    const stepsRaw = stepsIdx >= 0 ? (cells[stepsIdx] ?? '') : '';
    const filesRaw = filesIdx >= 0 ? (cells[filesIdx] ?? '') : '';
    const depsRaw = depsIdx >= 0 ? (cells[depsIdx] ?? '') : '';

    streams.push({
      name,
      steps: parseCommaSeparated(stepsRaw),
      files: parseCommaSeparated(filesRaw),
      dependencies: parseDependencies(depsRaw),
    });
  }

  return streams;
}

/**
 * Parse shared contracts code blocks.
 */
function parseSharedContracts(content: string): string[] {
  const sectionMatch = content.match(
    /shared\s+contracts?\s+required?\s*\n([\s\S]*?)(?=\n##|\n###|\n\*\*[A-Z]|$)/i,
  );
  if (!sectionMatch) return [];

  const section = sectionMatch[1];
  const contracts: string[] = [];
  const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(section)) !== null) {
    const block = match[1].trim();
    if (block) contracts.push(block);
  }

  return contracts;
}

/**
 * Parse execution order section.
 */
function parseExecutionOrder(content: string): string[] {
  const sectionMatch = content.match(
    /execution\s+order\s*\n([\s\S]*?)(?=\n##|\n###|\n\*\*[A-Z]|$)/i,
  );
  if (!sectionMatch) return [];

  return sectionMatch[1]
    .split('\n')
    .map((line) => line.replace(/^\s*\d+\.\s*/, '').replace(/^\s*[-*]\s*/, '').trim())
    .filter((line) => line.length > 0);
}

/**
 * Split a comma-separated string, trim each item.
 */
function parseCommaSeparated(raw: string): string[] {
  if (!raw || raw.toLowerCase() === 'none' || raw === '-') return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Parse dependencies from a cell value.
 * Handles: "none", "Stream: X", "Stream: X, Stream: Y", "X", "X, Y"
 */
function parseDependencies(raw: string): string[] {
  if (!raw || raw.toLowerCase() === 'none' || raw === '-') return [];
  return raw
    .split(',')
    .map((d) => d.replace(/^\s*stream:\s*/i, '').trim())
    .filter((d) => d.length > 0);
}
