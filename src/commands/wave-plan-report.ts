import pc from 'picocolors';
import type { ParallelStream } from './plan-parser.js';

export interface WavePlan {
  specId: string;
  phase0: { sharedContracts: string[] };
  waves: Array<{ waveNumber: number; streams: ParallelStream[] }>;
}

export function formatHumanWavePlan(plan: WavePlan): string {
  const lines: string[] = [];
  lines.push(`Wave Plan: ${plan.specId}`);
  lines.push('='.repeat(40));
  lines.push('');

  // Phase 0
  if (plan.phase0.sharedContracts.length > 0) {
    lines.push(pc.cyan('Phase 0 — Foundation (Lead, Sequential)'));
    lines.push('  Shared contracts to build first:');
    for (const contract of plan.phase0.sharedContracts) {
      // Show first line of each contract as preview
      const preview = contract.split('\n')[0].trim();
      lines.push(`    - ${preview}`);
    }
    lines.push('');
  }

  // Waves
  for (const wave of plan.waves) {
    const streamCount = wave.streams.length;
    const label = streamCount > 1 ? 'Parallel' : 'Sequential';
    lines.push(pc.green(`Wave ${wave.waveNumber} — ${label}`));

    const maxName = Math.max(...wave.streams.map((s) => s.name.length));
    for (const stream of wave.streams) {
      const steps = stream.steps.length > 0 ? `Steps: ${stream.steps.join(', ')}` : '';
      const files = stream.files.length > 0 ? `Files: ${stream.files.join(', ')}` : '';
      lines.push(`  ${stream.name.padEnd(maxName + 2)} ${steps}    ${files}`);
      if (stream.dependencies.length > 0) {
        lines.push(
          `  ${''.padEnd(maxName + 2)} Depends on: ${stream.dependencies.join(', ')}`,
        );
      }
    }
    lines.push('');
  }

  // Integration phase
  lines.push(pc.cyan('Integration Phase (Lead, Sequential)'));
  lines.push('  Wire up parallel outputs into shared files');

  return lines.join('\n');
}

export function formatJsonWavePlan(plan: WavePlan): string {
  return JSON.stringify({
    specId: plan.specId,
    phase0: plan.phase0,
    waves: plan.waves.map((w) => ({
      waveNumber: w.waveNumber,
      streams: w.streams.map((s) => ({
        name: s.name,
        steps: s.steps,
        files: s.files,
        dependencies: s.dependencies,
      })),
    })),
  });
}
