import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    target: 'node20',
    clean: true,
    shims: true,
    banner: { js: '#!/usr/bin/env node' },
    external: ['@anthropic-ai/claude-agent-sdk'],
  },
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    target: 'node20',
    shims: true,
    dts: true,
    external: ['@anthropic-ai/claude-agent-sdk'],
  },
]);
