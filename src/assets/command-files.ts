/**
 * Claude Code custom command file contents.
 * These are written to `.claude/commands/` in the target repository
 * when running `cdd install`.
 */

export const COMMAND_FILES: Record<string, string> = {
  'cdd-setup': `Initialize CDD context files for this repository.

## Instructions

### CLI Integration

After generating context files, check if the \`cdd\` CLI is available (\`which cdd\`).
If installed, run \`cdd health --json\` and \`cdd curate --json\` to establish a
baseline health score and validate the generated context quality. Present both
scores to the user as a starting point for context management.

You are CDD, a Context-Driven Development toolkit. You are running the setup operation.

Analyze this repository and generate structured context files following the CDD standard:

1. **Detect project type** — Read package.json, tsconfig.json, or equivalent. Identify: language, framework (Next.js, NestJS, React Native, CLI, etc.), monorepo vs single-package.

2. **Explore the codebase** — Identify 4-8 topics relevant to this specific project. Common topics: architecture, code-style, testing, dev-setup. Additional topics as needed: API conventions, database patterns, deployment, state management, error handling. Analyze in parallel:
   - Architecture: system design, module boundaries, data flow, key dependencies
   - Code style: import conventions, naming patterns, TypeScript rules, anti-patterns
   - Testing: frameworks, patterns, mocking conventions, coverage approach
   - Dev setup: local environment, services, database, build process

3. **Verify findings** — For each pattern discovered, grep the codebase to confirm:
   - The pattern actually exists (not aspirational)
   - It is the dominant pattern (>50% of relevant files use it)
   - Flag unverified claims — do not document patterns you can't confirm

4. **Generate Context files** — Write context files to the repo's context directory (\`.claude/context/\` by default, or \`.claude-context/\` if that already exists):
   - Each file gets YAML frontmatter: \`name\`, \`description\`, \`reference\` (if subtopic)
   - Follow token budgets: each file within the configured token budget (default: 2,000 tokens per file, configurable in .cdd/config.yaml)
   - Use imperative mood for instructions ("Use X", not "X should be used")
   - Code examples over prose (target code-to-prose ratio > 0.3)
   - No hedge words in constraints ("Use pnpm" not "Consider using pnpm")
   - No "why" explanations — instructions only

5. **Generate CLAUDE.md** — Create or update the root CLAUDE.md as a router:
   - Brief project description (2-3 sentences)
   - Commands table (most-used dev commands)
   - Context Files table with: File, Description, Load When, Critical Rules
   - Inline Context Annotations instruction
   - Total CLAUDE.md within budget (default: 3,000 tokens, configurable in .cdd/config.yaml). For single-package repos target 50-100 lines, for monorepos up to 150 lines.

6. **Self-audit** — Run quality checks on generated output before finalizing:
   - No double negatives, no open-ended lists
   - Critical rules surfaced in CLAUDE.md table
   - All file references valid
   - Token budgets respected

If the repo already has CLAUDE.md or .claude-context/ files, read them first and preserve useful content. Do not blindly overwrite existing context.

$ARGUMENTS`,

  'cdd-curate': `Audit the quality of this repository's AI context files.

## Instructions

### CLI Integration

Check if the \`cdd\` CLI is available (\`which cdd\`). If installed, run
\`cdd curate --json\` first to get static analysis results (score, findings,
token budgets). Present those findings, then focus your remaining analysis
on semantic checks: content conflicts, outdated code references, and
actionability assessment.

You are CDD, a Context-Driven Development toolkit. You are running the curate operation.

Scan this repository's CLAUDE.md and context files (\`.claude/context/\` or \`.claude-context/\`), then produce a quality report.

### Checks to Run

**Structure:**
- CLAUDE.md exists and has non-trivial content (>50 lines)
- Context directory exists (\`.claude/context/\` or \`.claude-context/\`)
- All file references in CLAUDE.md point to existing files
- Level 2 files have valid YAML frontmatter (name, description)
- Reference chain is valid (no broken references, no cycles)
- No orphan context files (files not referenced from CLAUDE.md or another context file)

**Token Efficiency:**
- CLAUDE.md within budget (default: 3,000 tokens, see .cdd/config.yaml)
- Each context file within budget (default: 2,000 tokens)
- Total context within budget (see .cdd/config.yaml)
- No redundant content across files (flag if Jaccard similarity > 0.4)

**Clarity:**
- No double negatives in rule sections (regex: NOT + negative verb)
- No hedge words in constraints ("might", "consider", "could", "should consider")
- No open-ended lists ("etc.", "and so on", "such as...and more")
- Positive framing before negative ("Use X. Do not use Y." not reversed)
- Actionability: instructions specific enough to follow without additional context (flag vague rules like 'Use TypeScript' — should be 'Enable strict mode with noImplicitAny: true')

**Structure Quality:**
- Code-to-prose ratio > 0.3 in pattern sections
- MUST/NEVER/CRITICAL keywords positioned at top or bottom of files (lost-in-the-middle)
- Imperative mood for instructions (flag passive voice)
- Progressive disclosure present (trigger-based references in CLAUDE.md)

**Level 3 Annotations:**
- Scan source files for \`// @context:\` annotations
- Error if annotation target file doesn't exist
- Warning if more than 5 annotations in the repo
- Warning if two annotations point to the same file
- Warning if annotation is in a generated file (__generated__/, dist/, build/, *.generated.ts, *.d.ts)
- Info if Level 3 context file exceeds 500 tokens

### Output Format

\`\`\`
CDD Curate Report — {repo-name}
================================

Score: {0-100}

ERRORS ({count}):
  x {finding}

WARNINGS ({count}):
  ! {finding}

INFO ({count}):
  i {finding}

Token Budget:
  CLAUDE.md: {tokens} / 2,000
  Total: {tokens} / 8,000
  Per file:
    {file}: {tokens} / 1,500

Suggested fixes:
  1. {actionable fix}
\`\`\`

$ARGUMENTS`,

  'cdd-health': `Measure the health of this repository's AI context files.

## Instructions

### CLI Integration

Check if the \`cdd\` CLI is available (\`which cdd\`). If installed, run
\`cdd health --json\` first to get structured health metrics (score, token
distribution, scenario matrix, file ROI, progressive disclosure percentage).
Present those metrics, then add your qualitative assessment: topic coverage,
actionability, and file organization recommendations.

You are CDD, a Context-Driven Development toolkit. You are running the health operation.

Analyze this repository's context files and compute a health score (0-100).

### Steps

1. **Token Analysis** — Count tokens per file (CLAUDE.md + all context files). Calculate distribution: what % of total budget does each file consume?

2. **Scenario Simulation** — For each scenario below, determine which context files you would load:
   - Bug fix in existing code
   - New feature implementation
   - Writing unit tests
   - Code review
   - Setting up local development

   Record which files load per scenario. Flag "dead" files (never loaded in any scenario) and "overloaded" files (loaded in every scenario — content should be in CLAUDE.md).

3. **ROI Calculation** — Per file: (times loaded across scenarios x 100) / token count. Higher ROI = good value for tokens spent.

4. **Progressive Disclosure Score** — What % of total context is deferred (not in CLAUDE.md)? Higher = better progressive disclosure. Target: > 60%.

5. **Health Score** — Composite:
   - Token efficiency (30%): Are files within budget? Is total reasonable?
   - Progressive disclosure (30%): Is context deferred appropriately?
   - File coverage (20%): Are standard topics covered for this project type?
   - ROI distribution (20%): Are tokens spent on high-value files?
   Consider the project type when evaluating coverage — a CLI tool needs different topics than a full-stack web app.

### Output Format

\`\`\`
CDD Health Report — {repo-name}
============================

Health Score: {0-100}

Token Distribution:
  CLAUDE.md:        {tokens} ({pct}%)
  {file}:           {tokens} ({pct}%)
  Total:            {tokens}

Scenario Matrix:
  Scenario          | Files Loaded
  Bug fix           | code-style.md, testing.md
  New feature       | architecture.md, code-style.md
  ...

File ROI:
  {file}: {roi} (loaded {n}/{total} scenarios)

Dead files: {list or "none"}
Overloaded files: {list or "none"}

Progressive Disclosure: {pct}% deferred
\`\`\`

$ARGUMENTS`,

  'cdd-learn': `Extract knowledge from a work session and add it to the repository's context.

## Instructions

### CLI Integration

After creating or updating a context file, check if the \`cdd\` CLI is available
(\`which cdd\`). If installed, run \`cdd curate --json\` to validate the new file
meets quality standards (token budget, valid frontmatter, no duplication).
Fix any issues before finalizing.

You are CDD, a Context-Driven Development toolkit. You are running the learn operation.

Analyze the provided source (git diff, session transcript, or document) and extract reusable knowledge for this repository's context files.

### Steps

1. **Analyze Source** — Read the provided input and extract:
   - Patterns discovered during the work
   - Decisions made and their rationale (convert rationale to instructions)
   - Anti-patterns encountered (what NOT to do)
   - Gotchas and non-obvious behaviors

2. **Check Existing Context** — Read all current context files (\`.claude/context/\` or \`.claude-context/\`). For each extracted item:
   - Does it overlap with existing content? (>60% overlap -> suggest merge)
   - Does it contradict existing content? (flag for human review)
   - Is it new knowledge? (suggest new file or append to existing)

3. **Generate Content** — Write following quality rules:
   - YAML frontmatter: name, description, reference (parent file if subtopic)
   - Imperative mood ("Use X", not "X should be used")
   - Code examples over prose (ratio > 0.3)
   - No hedge words, no double negatives, no "why" explanations
   - < 1,500 tokens per file

4. **Validate** — Before writing:
   - Does adding this push total context beyond the configured budget (see .cdd/config.yaml)?
   - Is there significant overlap with existing files?
   - Does the content follow the quality framework?

5. **Merge guidance** — If merging into an existing file, produce the COMPLETE updated file content (not a diff). Include all existing content plus new additions, maintaining frontmatter and section structure.

6. **Integrate** — Update CLAUDE.md router:
   - Add entry to Context Files table
   - Include 1-2 line description + "Load when" trigger
   - Surface any CRITICAL rules inline

If merging into an existing file, show the diff clearly so the user can review.

$ARGUMENTS`,
};
