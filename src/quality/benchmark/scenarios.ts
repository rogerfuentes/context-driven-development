import type { RuleContext, ContextFile } from '../rules/types.js';

export interface Scenario {
  name: string;
  description: string;
  keywords: string[];
}

export interface ScenarioResult {
  name: string;
  filesLoaded: string[];
}

export const DEFAULT_SCENARIOS: Scenario[] = [
  {
    name: 'Bug fix',
    description: 'Fix a bug in existing code',
    keywords: ['debug', 'fix', 'error', 'bug', 'issue', 'code-style', 'anti-pattern'],
  },
  {
    name: 'New feature',
    description: 'Implement a new feature',
    keywords: ['architecture', 'design', 'module', 'component', 'feature', 'pattern'],
  },
  {
    name: 'Write tests',
    description: 'Write unit or integration tests',
    keywords: ['test', 'testing', 'mock', 'assert', 'coverage', 'jest', 'vitest'],
  },
  {
    name: 'Code review',
    description: 'Review a pull request',
    keywords: ['style', 'convention', 'pattern', 'anti-pattern', 'review', 'standard'],
  },
  {
    name: 'Dev setup',
    description: 'Set up local development environment',
    keywords: ['setup', 'install', 'environment', 'local', 'docker', 'database', 'config'],
  },
];

function fileMatchesScenario(file: ContextFile, scenario: Scenario): boolean {
  const filenameLower = file.path.toLowerCase();
  const nameLower = (file.frontmatter?.name ?? '').toLowerCase();
  const descLower = (file.frontmatter?.description ?? '').toLowerCase();
  const contentSnippet = file.content.slice(0, 500).toLowerCase();

  let matchCount = 0;
  for (const kw of scenario.keywords) {
    if (filenameLower.includes(kw)) return true;

    if (nameLower.includes(kw) || descLower.includes(kw) || contentSnippet.includes(kw)) {
      matchCount++;
    }
  }

  return matchCount >= 2;
}

export function simulateScenarios(
  ctx: RuleContext,
  scenarios: Scenario[] = DEFAULT_SCENARIOS,
): ScenarioResult[] {
  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    const filesLoaded: string[] = [];

    // CLAUDE.md always loads (Level 1)
    if (ctx.claudeMdPath) {
      filesLoaded.push('CLAUDE.md');
    }

    // Check each context file
    for (const cf of ctx.contextFiles) {
      if (fileMatchesScenario(cf, scenario)) {
        filesLoaded.push(cf.path);
      }
    }

    results.push({ name: scenario.name, filesLoaded });
  }

  return results;
}
