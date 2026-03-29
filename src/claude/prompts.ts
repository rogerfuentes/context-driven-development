export const PROMPTS = {
  setup: `You are running the CDD CLI setup operation in the repository at {{cwd}}.

Analyze this repository and generate structured context files following the CDD standard.

## Steps

1. **Detect project type** -- Read package.json, tsconfig.json, Cargo.toml, or equivalent. Identify: language, framework, monorepo vs single-package.

2. **Explore the codebase** -- Analyze in parallel:
   - Architecture: system design, module boundaries, data flow, key dependencies
   - Code style: import conventions, naming patterns, TypeScript rules, anti-patterns
   - Testing: frameworks, patterns, mocking conventions, coverage approach
   - Dev setup: local environment, services, database, build process

3. **Verify findings** -- For each pattern discovered, grep the codebase to confirm:
   - The pattern actually exists (not aspirational)
   - It is the dominant pattern (>50% of relevant files use it)
   - Do not document patterns you cannot confirm

4. **Generate context file contents** -- For each topic, compose a context file for the repo's context directory (\`.claude/context/\` by default, or \`.claude-context/\` if that already exists):
   - Each file gets YAML frontmatter: \`name\`, \`description\`, \`reference\` (if subtopic)
   - Follow token budgets: each file < 1,500 tokens
   - Use imperative mood for instructions ("Use X", not "X should be used")
   - Code examples over prose (target code-to-prose ratio > 0.3)
   - No hedge words in constraints ("Use pnpm" not "Consider using pnpm")
   - No "why" explanations -- instructions only

5. **Generate CLAUDE.md content** -- Compose a CLAUDE.md as a router:
   - Brief project description (2-3 sentences)
   - Commands table (most-used dev commands)
   - For monorepos: Packages table grouped by directory (path, one-line description). Include every package.
   - Context Files table with: File, Description, Load When, Critical Rules
   - Total CLAUDE.md should be 50-100 lines (the package table helps reach this for monorepos)

6. **Self-audit** -- Verify generated output:
   - No double negatives, no open-ended lists
   - Critical rules surfaced in CLAUDE.md table
   - All file references valid
   - Token budgets respected

If the repo already has CLAUDE.md or context files, read them first and preserve useful content.

IMPORTANT: Do NOT convert time-bound documents into context files. Plans, spikes, RFCs, ADRs, strategies, tech-plans, and proposals are temporal — they describe what was planned, not what exists. Only convert reference material that describes the current state of the codebase (architecture, patterns, conventions, cost analysis, operational runbooks).

IMPORTANT: Do NOT write any files. Return all file contents in the JSON response below. The CLI will handle file writing after user confirmation.

## Output

Respond with ONLY a JSON object (no markdown fences, no commentary):
{
  "files": [{ "path": "relative/path", "action": "created|updated|skipped", "content": "full file content" }],
  "projectType": "string describing the project type",
  "topics": ["architecture", "code-style", "testing", ...]
}`,

  curateFull: `You are running the CDD CLI curate operation in the repository at {{cwd}}.

Read all context files (CLAUDE.md, \`.claude/context/\`, \`.claude-context/\`) and perform semantic quality checks.

## Checks

1. **Cross-file contradictions** -- Find rules in one file that contradict rules in another file.
2. **Staleness** -- Find references to patterns, files, or APIs that no longer exist in the codebase. Spot-check 3-5 claims against actual code by grepping.
3. **Completeness** -- Identify important patterns in the codebase that are not documented in any context file.
4. **Accuracy** -- For 3-5 specific claims in the context files, verify them against actual code.

## Output

Respond with ONLY a JSON object (no markdown fences, no commentary):
{
  "findings": [
    {
      "severity": "error|warning|info",
      "rule": "contradiction|stale-reference|unverified-claim|missing-pattern|inaccurate",
      "message": "description of the finding",
      "file": "path/to/file (optional)"
    }
  ]
}`,

  health: `You are running the CDD CLI health operation in the repository at {{cwd}}.

Analyze this repository's context files and compute a health score (0-100).

## Steps

1. **Token Analysis** -- Count tokens per file (CLAUDE.md + all context files). Calculate distribution: what percentage of total budget does each file consume?

2. **Scenario Simulation** -- For each scenario below, determine which context files would load:
   - Bug fix in existing code
   - New feature implementation
   - Writing unit tests
   - Code review
   - Setting up local development
   Record which files load per scenario. Flag "dead" files (never loaded) and "overloaded" files (loaded in every scenario).

3. **ROI Calculation** -- Per file: (times loaded across scenarios x 100) / token count. Higher ROI = good value.

4. **Progressive Disclosure Score** -- What percentage of total context is deferred (not in CLAUDE.md)? Target: > 60%.

5. **Health Score** -- Composite:
   - Token efficiency (30%): Files within budget, total reasonable
   - Progressive disclosure (30%): Context deferred appropriately
   - File coverage (20%): Standard topics covered for this project type
   - ROI distribution (20%): Tokens spent on high-value files

## Output

Respond with ONLY a JSON object (no markdown fences, no commentary):
{
  "score": 0-100,
  "tokenDistribution": { "file": { "tokens": N, "percentage": N } },
  "scenarios": [{ "name": "scenario name", "filesLoaded": ["file1.md"] }],
  "fileRoi": { "file": { "roi": N, "timesLoaded": N } },
  "deadFiles": ["file.md"],
  "overloadedFiles": ["file.md"],
  "progressiveDisclosure": N
}`,

  learn: `You are running the CDD CLI learn operation in the repository at {{cwd}}.

Analyze the following source material and extract reusable knowledge for this repository's context files.

## Source Material

{{source}}

## Steps

1. **Analyze Source** -- Extract:
   - Patterns discovered during the work
   - Decisions made (convert rationale to instructions)
   - Anti-patterns encountered (what NOT to do)
   - Gotchas and non-obvious behaviors

2. **Check Existing Context** -- Read all current context files (\`.claude/context/\` or \`.claude-context/\`). For each extracted item:
   - Does it overlap with existing content? (>60% overlap -> suggest merge)
   - Does it contradict existing content? (flag for review)
   - Is it new knowledge? (suggest new file or append)

3. **Generate Content** -- Follow quality rules:
   - YAML frontmatter: name, description, reference (parent file if subtopic)
   - Imperative mood ("Use X", not "X should be used")
   - Code examples over prose (ratio > 0.3)
   - No hedge words, no double negatives
   - < 1,500 tokens per file

4. **Validate** -- Before finalizing:
   - Does adding this push total context over 8,000 tokens?
   - Is there significant overlap with existing files?

IMPORTANT: Do NOT write any files. Return all file contents in the JSON response below. The CLI will handle file writing after user confirmation.

## Output

Respond with ONLY a JSON object (no markdown fences, no commentary):
{
  "action": "create|merge",
  "targetFile": "relative/path/to/file.md",
  "content": "full file content including frontmatter",
  "overlap": [{ "file": "existing-file.md", "similarity": 0.0-1.0 }],
  "claudeMdUpdate": "updated CLAUDE.md content or null"
}`,
  setupPackage: `You are running the CDD CLI setup operation for a single package inside a monorepo.

Package directory: {{packagePath}}
Package name: {{packageName}}
Repository root: {{cwd}}

## Root-Level Context (already documented — do NOT duplicate)

{{rootContext}}

## Your Task

Analyze ONLY the package at {{packagePath}} and generate context files for it. Focus on what is **unique** to this package:

- Package-specific patterns not covered by root context
- Package-specific commands, dependencies, gotchas
- How this package relates to other packages in the monorepo
- Package-specific testing patterns or build configuration

Do NOT duplicate content already in root CLAUDE.md or root context files.

## Steps

1. **Read package.json** — Identify dependencies, scripts, framework
2. **Explore package code** — Focus on {{packagePath}}/ only
3. **Verify findings** — Grep to confirm patterns exist
4. **Generate CLAUDE.md** — A package-level router:
   - 2-3 sentence description
   - Package-specific commands table
   - Context Files table (if complex enough to warrant separate files)
   - Total CLAUDE.md < 1,500 tokens
5. **Generate context files** (optional) — Only if the package has 3+ distinct topics:
   - Place in \`{{packagePath}}/.claude/context/\` or \`{{packagePath}}/.claude-context/\`
   - Each file < 1,500 tokens with YAML frontmatter

Most packages only need a CLAUDE.md. Only create a context directory for complex packages.

IMPORTANT: Do NOT write any files. Return all file contents in the JSON response below.

## Output

Respond with ONLY a JSON object (no markdown fences, no commentary):
{
  "files": [{ "path": "relative/path/from/repo/root", "action": "created|updated|skipped", "content": "full file content" }],
  "projectType": "string describing the package type",
  "topics": ["topic1", "topic2"]
}`,
} as const;
