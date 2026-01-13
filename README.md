# Context-Driven Development

A unified Claude Code plugin for context management and spec-driven development.

## Philosophy

> **RAG-first**: Good context enables "just prompt" without ceremony. Specs are for when you want structure, not mandatory overhead.

This plugin combines:
- **Context Management**: Curated knowledge base with product and technical context
- **Spec-Driven Workflow**: Structured planning and implementation with optional parallelization

## Installation

Add to your Claude Code plugins:

```bash
# Clone or copy to your plugins directory
cp -r context-driven-development ~/.claude/plugins/
```

## Quick Start

```bash
# Initialize in your project
/cdd:setup

# Check context health
/cdd:health

# Create a spec for a feature
/cdd:create "add user authentication"

# Implement it
/cdd:implement add-user-authentication
```

## Commands

### Context Management

| Command | Description |
|---------|-------------|
| `/cdd:setup` | Initialize .claude/ structure with workflow, product context |
| `/cdd:learn [topic]` | Extract patterns and create context files |
| `/cdd:curate` | Validate, dedupe, and optimize context |
| `/cdd:health` | Quick health check of context system |

### Spec Workflow

| Command | Description |
|---------|-------------|
| `/cdd:create <description>` | Analyze and create implementation plan |
| `/cdd:implement <spec-id>` | Execute the plan with validation gates |

## Directory Structure

After running `/cdd:setup`:

```
your-project/
├── CLAUDE.md                    # Entry point with ToC
└── .claude/
    ├── project-config.json     # Validation gates configuration
    ├── product/                 # Product sense
    │   ├── vision.md           # What and why
    │   ├── guidelines.md       # Brand, UX standards
    │   └── constraints.md      # Business rules
    ├── context/                 # Technical patterns
    │   ├── workflow.md         # Git flow and workflow
    │   └── [topic].md          # Created by /cdd:learn
    └── specs/                   # Active work (ephemeral)
        └── [feature]/
            ├── analysis.md     # Current state, gaps
            ├── plan.md         # Steps, parallel analysis
            └── coordination.md # For parallel execution
```

## Workflow

### RAG-First Approach

For most tasks, good context is enough:

1. Run `/cdd:setup` once
2. Fill in product/ files
3. Run `/cdd:learn` to create technical context
4. Just prompt normally - Claude has the context it needs

### When to Use Specs

Use `/cdd:create` when:
- Feature is complex (multiple files, unclear scope)
- You want to think through the approach first
- Parallel execution might be beneficial
- You want documentation of what's being built

### Parallel Execution

For complex features with independent work streams:

```bash
# Create spec with parallel analysis
/cdd:create "add user profile with avatar upload" --full

# If plan supports it, run with parallel flag
/cdd:implement user-profile --parallel
```

The `--parallel` flag:
- Creates coordination.md with contracts
- Launches multiple agents for independent streams
- Main agent handles integration

## Skills

Internal skills used by commands:

| Skill | Purpose |
|-------|---------|
| `run-tests` | Run unit tests with smart file selection |
| `run-lint` | Run linter with optional auto-fix |
| `run-typecheck` | Run TypeScript type checking |
| `use-worktrees` | Create isolated git worktrees |

## Configuration

### Validation Gates

Configured in `.claude/project-config.json`:

```json
{
  "validationGates": {
    "typescript": {
      "enabled": true,
      "command": "bun run tsc",
      "exitOnError": true
    },
    "lint": {
      "enabled": true,
      "command": "bun run lint",
      "autoFix": true,
      "fixCommand": "bun run lint --fix",
      "exitOnError": true
    },
    "unitTests": {
      "enabled": true,
      "command": "bun run test",
      "smartFileSelection": true,
      "exitOnError": false
    }
  }
}
```

### CLAUDE.md Table of Contents

CLAUDE.md uses a ToC pattern with hints for when to load context:

```markdown
## Technical Context
| File | Load when... |
|------|--------------|
| `context/workflow.md` | Making git commits, branching decisions |
| `context/api.md` | Creating/modifying API endpoints |
| `context/testing.md` | Writing tests |
```

## Token Budget

| Category | Target | Max |
|----------|--------|-----|
| CLAUDE.md | <100 lines | 150 lines |
| Product context | ~750 tokens | 1,000 tokens |
| Technical context | ~2,000 tokens | 3,000 tokens |
| Total | ~3,500 tokens | 5,000 tokens |

Run `/cdd:health` to check your budget.

## Command Reference

### /cdd:setup

```bash
/cdd:setup           # Initialize project
/cdd:setup --reset   # Reinitialize (overwrites existing)
```

Sets up:
- Workflow context (git flow)
- Product context (vision, guidelines, constraints)
- Validation gates configuration
- CLAUDE.md with ToC pattern

### /cdd:learn

```bash
/cdd:learn [topic]
/cdd:learn --source session    # Extract from current conversation
/cdd:learn --source url <url>  # Extract from external docs
/cdd:learn --source prompt     # Interactive exploration
```

Creates context files by exploring your codebase or external resources.

### /cdd:curate

```bash
/cdd:curate                    # Check everything
/cdd:curate --scope context    # Check only context/
/cdd:curate --fix              # Auto-fix safe issues
```

Validates context files for duplicates, outdated references, and token budget.

### /cdd:health

```bash
/cdd:health
```

Quick status showing token counts and health indicators.

### /cdd:create

```bash
/cdd:create <description>
/cdd:create <description> --quick   # Skip analysis
/cdd:create <description> --full    # Full analysis with parallelization
```

Creates analysis.md and plan.md in .claude/specs/<feature>/.

### /cdd:implement

```bash
/cdd:implement <spec-id>
/cdd:implement <spec-id> --parallel   # Use coordinated sub-agents
/cdd:implement <spec-id> --worktree   # Isolate in git worktree
```

Executes the plan with validation gates.

## Best Practices

### CLAUDE.md
- Keep under 100 lines
- Use table of contents with "Load when..." hints
- Reference files, don't duplicate content

### Context Files
- One topic per file
- 300-500 tokens each
- Include real code examples from your codebase
- Document anti-patterns, not just patterns

### Product Context
- Fill in vision.md first - it guides everything
- Be specific in constraints.md
- Update guidelines.md as you learn

### Specs
- Use `--quick` for small changes
- Use `--full` for complex features
- Delete specs after implementation
- Run `/cdd:learn` after completing features

## Comparison: When to Use What

| Situation | Approach |
|-----------|----------|
| Simple bug fix | Just prompt |
| Add small feature | Just prompt |
| Complex feature | `/cdd:create` → `/cdd:implement` |
| Multi-file refactor | `/cdd:create --full` → `/cdd:implement` |
| Independent work streams | `/cdd:create --full` → `/cdd:implement --parallel` |
| Risky changes | `/cdd:implement --worktree` |

## License

MIT
