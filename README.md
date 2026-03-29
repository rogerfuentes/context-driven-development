# Context-Driven Development (CDD)

A CLI toolkit and Claude Code plugin for managing AI context files and spec-driven development.

## Philosophy

> **RAG-first**: Good context enables "just prompt" without ceremony. Specs are for when you want structure, not mandatory overhead.

CDD combines:
- **CLI** (`@kelios/cdd`): Static quality analysis, health scoring, context management
- **Plugin commands** (`/cdd:*`): Spec-driven planning, implementation, parallel execution

## Installation

### CLI (recommended)

```bash
npm install -g @kelios/cdd

# Or per-project
npm install -D @kelios/cdd

# Or one-shot
npx @kelios/cdd setup
```

After installing, the `cdd` binary is available globally.

### Plugin (for Claude Code editor integration)

```bash
# Install commands into your repo
cdd install

# Or via marketplace
/plugin marketplace add rogerfuentes/context-driven-development
/plugin install context-driven-development
```

## Quick Start

```bash
# Scaffold context files for your project
cdd setup

# Check context quality (static analysis, 0-100 score)
cdd health

# Audit context files
cdd curate

# Extract learnings from a session
cdd learn

# In Claude Code: plan and implement features
/cdd:create "add user authentication"
/cdd:implement add-user-authentication
```

## CLI Commands

### Context Management

| Command | Description |
|---------|-------------|
| `cdd setup` | Scaffold context files (AI-powered) |
| `cdd learn` | Extract knowledge from sessions, files, or URLs |
| `cdd curate` | Audit context quality (static + `--full` for semantic) |
| `cdd health` | Health score (0-100) with token analysis and ROI |
| `cdd status` | Show progress across all active specs |

### Team Agent Tools

| Command | Description |
|---------|-------------|
| `cdd wave-plan <spec-id>` | Generate execution waves from dependency graph |
| `cdd conflict-detect <spec-id>` | Detect shared-file conflicts before parallel launch |

### Utility

| Command | Description |
|---------|-------------|
| `cdd install` | Write `.claude/commands/` for editor use |
| `cdd update-commands` | Re-install after version bump |

### Global Flags

All commands support: `--json`, `--verbose`, `--dry-run`, `-y/--yes`

## Plugin Commands

For use inside Claude Code (editor integration):

| Command | Description |
|---------|-------------|
| `/cdd:setup` | Initialize `.claude/` structure with product context |
| `/cdd:learn` | Extract patterns into context files |
| `/cdd:curate` | Validate and optimize context |
| `/cdd:health` | Quick health check |
| `/cdd:create <desc>` | Analyze and create implementation plan |
| `/cdd:implement <id>` | Execute plan with validation gates |

When the CLI is installed, plugin commands automatically delegate static analysis to `cdd curate --json` and `cdd health --json`.

## Directory Structure

After running `cdd setup`:

```
your-project/
├── CLAUDE.md                    # Entry point with ToC
├── .cdd/
│   └── config.yaml              # Token budgets, thresholds (optional)
└── .claude/
    ├── project-config.json      # Validation gates
    ├── product/                  # Product sense
    │   ├── vision.md
    │   ├── guidelines.md
    │   └── constraints.md
    ├── context/                  # Technical patterns
    │   ├── workflow.md
    │   └── [topic].md
    └── specs/                    # Active work
        └── [feature]/
            ├── analysis.md
            ├── plan.md
            └── summary.md       # Auto-generated after implementation
```

## Configuration

### Token Budgets (`.cdd/config.yaml`)

```yaml
cdd:
  contextDir: ".claude/context"
  budgets:
    claudeMd: 3000       # CLAUDE.md token limit
    perFile: 2000         # Per context file
    perFileMin: 200       # Minimum useful file size
    total: 0              # 0 = disabled (progressive disclosure)
  thresholds:
    jaccardDuplication: 0.4
    maxAnnotations: 5
    codeToProseRatio: 0.3
```

### Validation Gates (`.claude/project-config.json`)

```json
{
  "validationGates": {
    "typescript": { "enabled": true, "command": "npm run tsc", "exitOnError": true },
    "lint": { "enabled": true, "command": "npm run lint", "autoFix": true },
    "unitTests": { "enabled": true, "command": "npm test", "smartFileSelection": true }
  }
}
```

## Workflow

### Context-First (most tasks)

```bash
cdd setup              # Once per project
cdd learn              # Extract patterns as you work
cdd curate             # Keep context clean
cdd health             # Track quality over time
```

### Spec-Driven (complex features)

```bash
/cdd:create "add payment flow" --full    # Analyze + plan
/cdd:implement payment-flow --parallel   # Execute with team agents
```

### Team Agent Mode

For parallel execution, CDD provides automated conflict detection and wave planning:

```bash
# Before launching parallel agents
cdd conflict-detect payment-flow    # Find shared-file overlaps
cdd wave-plan payment-flow          # Generate execution waves
```

Key patterns enforced:
- **Lead-owns-shared-files**: Lead agent exclusively modifies shared files (types, barrel exports, config)
- **Wave execution**: Dependency graph determines which streams run in parallel
- **Phase 0 foundation**: Shared types/contracts built before any parallel work
- **Test enforcement**: Blocks completion if test ACs exist but no test files created

### Spec Permanence

```bash
/cdd:create "payment flow" --permanent initiatives/   # Persistent specs
/cdd:create "quick fix"                               # Ephemeral (default)
```

## Quality Engine

The CLI includes a static quality engine that checks context files without calling Claude:

- **Structure**: CLAUDE.md exists, context directory, valid frontmatter, reference chains
- **Efficiency**: Token budgets, duplicate detection (Jaccard similarity)
- **Clarity**: No double negatives, hedge words, open-ended lists, passive voice
- **Annotations**: `@context:` inline annotations validation

Run `cdd curate` for static checks, `cdd curate --full` to add Claude-powered semantic analysis.

## Health Scoring

`cdd health` produces a 0-100 composite score:

| Metric | Weight | What it measures |
|--------|--------|-----------------|
| Token efficiency | 30% | Files within budget, total reasonable |
| Progressive disclosure | 30% | Context deferred from CLAUDE.md |
| File coverage | 20% | Standard topics covered |
| ROI distribution | 20% | Tokens spent on high-value files |

Scores are tracked in `.cdd/health-history.json` for trend analysis.

## License

MIT
