import type { CurateFullResult } from '../claude/types.js';
import type { Severity } from '../quality/rules/types.js';

const VALID_SEVERITIES = new Set<Severity>(['error', 'warning', 'info']);

export function parseCurateFullResponse(output: string): CurateFullResult {
  const jsonMatch =
    output.match(/```json\s*([\s\S]*?)```/) ||
    output.match(/\{[\s\S]*"findings"[\s\S]*\}/);

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      if (Array.isArray(parsed.findings)) {
        const findings = parsed.findings
          .filter(isValidFinding)
          .map((f: Record<string, unknown>) => ({
            severity: f.severity as Severity,
            rule: typeof f.rule === 'string' ? f.rule : 'semantic',
            message: f.message as string,
            ...(typeof f.file === 'string' ? { file: f.file } : {}),
          }));
        return { findings };
      }
    } catch {
      // Fall through to empty findings
    }
  }

  return { findings: [] };
}

function isValidFinding(f: Record<string, unknown>): boolean {
  return (
    typeof f.message === 'string' &&
    typeof f.severity === 'string' &&
    VALID_SEVERITIES.has(f.severity as string)
  );
}
