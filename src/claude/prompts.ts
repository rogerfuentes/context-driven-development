export const PROMPTS = {
  setup: `You are an expert developer-context generator. You MUST respond with valid JSON only. You MUST NOT write any files — the CLI handles all file I/O.

You are running the CDD CLI setup operation in the repository at {{cwd}}. Analyze this repository and generate structured context files following the CDD standard.

## Steps

1. **Detect project type** -- Read package.json, tsconfig.json, Cargo.toml, or equivalent. Identify: language, framework, monorepo vs single-package.

2. **Explore the codebase** -- Identify 4-8 topics relevant to this specific project. Common topics include: architecture, code-style, testing, dev-setup. Additional topics may include: API conventions, database patterns, deployment, state management, error handling — include only what's relevant. For each topic, analyze the codebase in parallel.

3. **Verify findings** -- For each pattern discovered, grep the codebase to confirm:
   - The pattern actually exists (not aspirational)
   - It is the dominant pattern (>50% of relevant files use it)
   - Do not document patterns you cannot confirm

4. **Generate context file contents** -- For each topic, compose a context file for the repo's context directory (\`.claude/context/\` by default, or \`.claude-context/\` if that already exists):
   - Each file gets YAML frontmatter: \`name\`, \`description\`, \`reference\` (if subtopic)
   - Follow token budgets: each file within the configured token budget (default: 2,000 tokens per file)
   - Use imperative mood for instructions ("Use X", not "X should be used")
   - Code examples over prose (target code-to-prose ratio > 0.3)
   - No hedge words in constraints ("Use pnpm" not "Consider using pnpm")
   - No "why" explanations -- instructions only

5. **Generate CLAUDE.md content** -- Compose a CLAUDE.md as a router:
   - Brief project description (2-3 sentences)
   - Commands table (most-used dev commands)
   - For monorepos: Packages table grouped by directory (path, one-line description). Include every package.
   - Context Files table with: File, Description, Load When, Critical Rules
   - Total CLAUDE.md should be 50-100 lines for single-package repos, up to 150 lines for monorepos with many packages (the package table helps reach this for monorepos)

6. **Self-audit** -- Verify generated output:
   - No double negatives, no open-ended lists
   - Critical rules surfaced in CLAUDE.md table
   - All file references valid
   - Token budgets respected

If the repo already has CLAUDE.md or context files, read them first and preserve useful content.

IMPORTANT: Do NOT convert time-bound documents into context files. Plans, spikes, RFCs, ADRs, strategies, tech-plans, and proposals are temporal — they describe what was planned, not what exists. Only convert reference material that describes the current state of the codebase (architecture, patterns, conventions, cost analysis, operational runbooks).

IMPORTANT: Do NOT write any files. Return all file contents in the JSON response below. The CLI will handle file writing after user confirmation.

## Example (truncated)

{
  "files": [
    { "path": ".claude/context/architecture.md", "action": "created", "content": "---\\nname: Architecture\\ndescription: System design and module boundaries\\n---\\n\\n# Architecture\\n\\nUse a modular monolith pattern..." },
    { "path": "CLAUDE.md", "action": "created", "content": "# My Project\\n\\nA TypeScript API server...\\n\\n## Commands\\n| Command | Purpose |\\n..." }
  ],
  "projectType": "TypeScript API server (NestJS)",
  "topics": ["architecture", "code-style", "testing", "dev-setup"]
}

## Output

Respond with ONLY valid JSON. No markdown fences, no commentary, no text before or after the JSON. The response must start with { and end with }.
{
  "files": [{ "path": "relative/path", "action": "created|updated|skipped", "content": "full file content" }],
  "projectType": "string describing the project type",
  "topics": ["architecture", "code-style", "testing", ...]
}

If the repository is empty or has no detectable source code, return: { "files": [], "projectType": "unknown", "topics": [] }`,

  curateFull: `You are running the CDD CLI curate operation in the repository at {{cwd}}.

Read all context files (CLAUDE.md, \`.claude/context/\`, \`.claude-context/\`) and perform semantic quality checks.

## Checks

1. **Cross-file contradictions** -- Find rules in one file that contradict rules in another file.
2. **Staleness** -- Find references to patterns, files, or APIs that no longer exist in the codebase. Spot-check claims proportional to context size (minimum 3, add 1 per context file beyond 3 files).
3. **Completeness** -- Identify important patterns in the codebase that are not documented in any context file.
4. **Accuracy** -- For 3-5 specific claims in the context files, verify them against actual code.
5. **Actionability** -- For each context file, assess whether instructions are specific enough to follow without additional context. Flag vague instructions like 'Use TypeScript' that should be 'Enable strict mode in tsconfig.json with noImplicitAny: true'.

Rank all findings by impact: high-priority findings are errors or contradictions that could cause incorrect code generation; medium-priority findings affect quality but not correctness; low-priority findings are style or completeness improvements.

## Output

Respond with ONLY valid JSON. No markdown fences, no commentary, no text before or after the JSON. The response must start with { and end with }.
{
  "findings": [
    {
      "severity": "error|warning|info",
      "rule": "contradiction|stale-reference|unverified-claim|missing-pattern|inaccurate|vague-instruction",
      "message": "description of the finding",
      "file": "path/to/file (optional)",
      "priority": "high|medium|low"
    }
  ]
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
   - Within the configured per-file token budget

When action is 'merge', the content field should contain the COMPLETE updated file (not a diff). Include all existing content plus the new additions, maintaining frontmatter and section structure.

4. **Validate** -- Before finalizing:
   - Does adding this push total context beyond the configured total budget?
   - Is there significant overlap with existing files?

IMPORTANT: Do NOT write any files. Return all file contents in the JSON response below. The CLI will handle file writing after user confirmation.

## Output

Respond with ONLY valid JSON. No markdown fences, no commentary, no text before or after the JSON. The response must start with { and end with }.
{
  "action": "create|merge",
  "targetFile": "relative/path/to/file.md",
  "content": "full file content including frontmatter",
  "overlap": [{ "file": "existing-file.md", "similarity": 0.0-1.0 }],
  "claudeMdUpdate": "updated CLAUDE.md content or null"
}

If no useful patterns can be extracted from the source material, return: { "action": "skip", "targetFile": null, "content": null, "overlap": [], "claudeMdUpdate": null, "reason": "No actionable patterns found" }`,
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
   - Total CLAUDE.md within the configured per-file token budget
5. **Generate context files** (optional) — Only if the package has 3+ distinct topics:
   - Place in \`{{packagePath}}/.claude/context/\` or \`{{packagePath}}/.claude-context/\`
   - Each file within the configured per-file token budget, with YAML frontmatter

Most packages only need a CLAUDE.md. Only create a context directory for complex packages.

IMPORTANT: Do NOT write any files. Return all file contents in the JSON response below.

## Output

Respond with ONLY valid JSON. No markdown fences, no commentary, no text before or after the JSON. The response must start with { and end with }.
{
  "files": [{ "path": "relative/path/from/repo/root", "action": "created|updated|skipped", "content": "full file content" }],
  "projectType": "string describing the package type",
  "topics": ["topic1", "topic2"]
}`,
} as const;
