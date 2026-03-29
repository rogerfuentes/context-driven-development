import pc from 'picocolors';

export function getScoreColor(score: number): (text: string) => string {
  if (score >= 80) return pc.green;
  if (score >= 50) return pc.yellow;
  return pc.red;
}
