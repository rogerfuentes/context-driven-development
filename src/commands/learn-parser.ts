import type { TrainResult } from '../claude/types.js';

/**
 * Parse Claude's response from the learn command into a structured TrainResult.
 * Tries JSON extraction first, then falls back to heuristic parsing.
 */
export function parseLearnResponse(output: string): TrainResult {
  // Try markdown-fenced JSON first
  const fencedMatch = output.match(/```json\s*([\s\S]*?)```/);
  if (fencedMatch) {
    const result = tryParseTrainJson(fencedMatch[1]);
    if (result) return result;
  }

  // Try to find a raw JSON object containing "action" and "targetFile"
  const result = extractJsonObject(output);
  if (result) return result;

  // Heuristic fallback
  const fileRefMatch = output.match(/[`"]([^\s`"]+\.md)[`"]/i);
  const action: TrainResult['action'] = output.toLowerCase().includes('merge') ? 'merge' : 'create';
  const targetFile = fileRefMatch ? fileRefMatch[1] : 'unknown.md';

  return { action, targetFile, content: output, overlap: [] };
}

function tryParseTrainJson(text: string): TrainResult | null {
  try {
    const parsed = JSON.parse(text.trim());
    if (parsed.targetFile) {
      return {
        action: parsed.action || 'create',
        targetFile: parsed.targetFile,
        content: parsed.content || '',
        overlap: parsed.overlap || [],
        claudeMdUpdate: parsed.claudeMdUpdate,
      };
    }
  } catch {
    // not valid JSON
  }
  return null;
}

/**
 * Find the first valid JSON object in the text that contains "action" and "targetFile".
 * Walks forward from each '{' and uses brace-depth matching.
 */
function extractJsonObject(text: string): TrainResult | null {
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const start = text.indexOf('{', searchFrom);
    if (start === -1) break;

    const slice = text.slice(start);
    if (!slice.includes('"action"') || !slice.includes('"targetFile"')) {
      searchFrom = start + 1;
      continue;
    }

    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = start; i < text.length; i++) {
      const ch = text[i];

      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\' && inString) {
        escape = true;
        continue;
      }
      if (ch === '"' && !escape) {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          const candidate = text.slice(start, i + 1);
          const result = tryParseTrainJson(candidate);
          if (result) return result;
          break;
        }
      }
    }

    searchFrom = start + 1;
  }
  return null;
}
