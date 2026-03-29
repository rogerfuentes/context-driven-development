import type { InitResult } from '../claude/types.js';

/**
 * Parse Claude's response from the setup command into a structured InitResult.
 * Tries JSON extraction first, then falls back to heuristic parsing.
 */
export function parseSetupResponse(output: string): InitResult {
  // Try markdown-fenced JSON first
  const fencedMatch = output.match(/```json\s*([\s\S]*?)```/);
  if (fencedMatch) {
    const result = tryParseInitJson(fencedMatch[1]);
    if (result) return result;
  }

  // Try to find a raw JSON object containing "files"
  const result = extractJsonObject(output);
  if (result) return result;

  // Heuristic fallback: scan output for file creation/update patterns
  const files: InitResult['files'] = [];
  const seen = new Set<string>();

  const patterns: Array<{ regex: RegExp; action: 'created' | 'updated' }> = [
    { regex: /(?:created?|wrote|generated?)\s+[`"]?([^\s`"]+\.md)[`"]?/gi, action: 'created' },
    { regex: /(?:updated?|modified?)\s+[`"]?([^\s`"]+\.md)[`"]?/gi, action: 'updated' },
  ];

  for (const { regex, action } of patterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(output)) !== null) {
      if (!seen.has(match[1])) {
        seen.add(match[1]);
        files.push({ path: match[1], action });
      }
    }
  }

  const projectTypeMatch = output.match(/project\s*type[:\s]+([^\n]+)/i);
  const projectType = projectTypeMatch ? projectTypeMatch[1].trim() : 'unknown';

  const topicsMatch = output.match(/topics?[:\s]+([^\n]+)/i);
  const topics = topicsMatch
    ? topicsMatch[1]
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  return { files, projectType, topics };
}

function tryParseInitJson(text: string): InitResult | null {
  try {
    const parsed = JSON.parse(text.trim());
    if (Array.isArray(parsed.files)) {
      return {
        files: parsed.files,
        projectType: typeof parsed.projectType === 'string' ? parsed.projectType : 'unknown',
        topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      };
    }
  } catch {
    // not valid JSON
  }
  return null;
}

/**
 * Find the first valid JSON object in the text that contains "files".
 * Walks forward from each '{' and uses brace-depth matching.
 */
function extractJsonObject(text: string): InitResult | null {
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const start = text.indexOf('{', searchFrom);
    if (start === -1) break;

    const slice = text.slice(start);
    if (!slice.includes('"files"')) {
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
          const result = tryParseInitJson(candidate);
          if (result) return result;
          break;
        }
      }
    }

    searchFrom = start + 1;
  }
  return null;
}
