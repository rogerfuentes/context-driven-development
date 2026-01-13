---
name: cdd:setup
description: Initialize Context-Driven Development structure in the current project
argument-hint: [--reset]
---

# Context-Driven Development: Setup Command

Initialize the CDD structure for a project, focusing on workflow, git-flow, and product context.

## Usage

```bash
/cdd:setup           # Initialize new project
/cdd:setup --reset   # Reinitialize (overwrites existing)
```

## Important: Template Path Resolution

**CRITICAL**: Template paths must resolve to the plugin installation directory.

1. **Determine plugin root** (try in order):
   - **Package install**: `packages/claude-plugins/context-driven-development/`
   - **Development mode**: `.claude/plugins/context-driven-development/`
   - **Marketplace install**: `~/.claude/plugins/marketplaces/context-driven-development/`
   - **Direct install**: `~/.claude/plugins/context-driven-development/`
   - Store as `PLUGIN_ROOT` for reuse

2. **Read templates using**:
   - `${PLUGIN_ROOT}/templates/[template-path]`

3. **Path resolution logic**:
   ```
   if (exists('packages/claude-plugins/context-driven-development/templates/'))
     PLUGIN_ROOT = 'packages/claude-plugins/context-driven-development'
   else if (exists('.claude/plugins/context-driven-development/templates/'))
     PLUGIN_ROOT = '.claude/plugins/context-driven-development'
   else if (exists('~/.claude/plugins/marketplaces/context-driven-development/templates/'))
     PLUGIN_ROOT = '~/.claude/plugins/marketplaces/context-driven-development'
   else
     PLUGIN_ROOT = '~/.claude/plugins/context-driven-development'
   ```

## Process

### Phase 1: Pre-flight Checks

#### Step 1.1: Check Existing Structure

```bash
ls -la .claude/ 2>/dev/null
```

**If `.claude/` exists AND no `--reset` flag:**

Use **AskUserQuestion**:
```javascript
AskUserQuestion({
  questions: [{
    question: "A .claude/ directory already exists. What would you like to do?",
    header: "Existing Setup",
    multiSelect: false,
    options: [
      { label: "Reinitialize", description: "Overwrite existing configuration" },
      { label: "Cancel", description: "Keep existing setup unchanged" }
    ]
  }]
})
```

**If "Cancel"**: Stop with message "Setup cancelled. Existing configuration preserved."

#### Step 1.2: Detect Project Type

Classify the project:

```bash
# Check for existing code
git log --oneline -1 2>/dev/null
ls src/ 2>/dev/null
ls app/ 2>/dev/null
```

**Brownfield indicators:**
- Git history exists with commits
- Source directories present with code
- package.json with dependencies

**Greenfield indicators:**
- No git history or only initial commit
- Empty or minimal source directories
- Fresh package.json

Report classification:
```
Project Classification: [Brownfield/Greenfield]
Reason: [explanation]
```

### Phase 2: Project Discovery

#### Step 2.1: Detect Package Manager

Check for lock files in order:

```bash
ls bun.lockb 2>/dev/null && echo "bun"
ls pnpm-lock.yaml 2>/dev/null && echo "pnpm"
ls yarn.lock 2>/dev/null && echo "yarn"
ls package-lock.json 2>/dev/null && echo "npm"
```

**If none found:** Ask user to specify.

#### Step 2.2: Read package.json

```bash
cat package.json
```

Extract:
- `name` → Project name
- `scripts.build` → Build command
- `scripts.test` → Test command
- `scripts.lint` → Lint command
- `scripts.typecheck` or check for `tsc` → TypeScript command
- `dependencies` → Project type hints

#### Step 2.3: Detect Project Type

Based on dependencies, classify:

| Dependency | Project Type |
|------------|--------------|
| `react-native` | Mobile (React Native) |
| `expo` | Mobile (Expo) |
| `next` | Web (Next.js) |
| `@nestjs/core` | Backend (NestJS) |
| `express` | Backend (Express) |
| `react` (without native) | Web (React) |

**If unclear:** Ask user:

```javascript
AskUserQuestion({
  questions: [{
    question: "What type of project is this?",
    header: "Project Type",
    multiSelect: false,
    options: [
      { label: "Mobile", description: "React Native, Expo, or similar" },
      { label: "Web", description: "React, Next.js, Vue, or similar" },
      { label: "Backend", description: "Node.js API, NestJS, Express" },
      { label: "Full-stack", description: "Combined frontend + backend" }
    ]
  }]
})
```

### Phase 3: Configuration Gathering

#### Step 3.1: Workflow Preferences

Use **AskUserQuestion** to gather workflow preferences in a single interaction:

```javascript
AskUserQuestion({
  questions: [
    {
      question: "What git branching strategy do you follow?",
      header: "Git Flow",
      multiSelect: false,
      options: [
        { label: "Trunk-based", description: "Short-lived branches, frequent merges to main" },
        { label: "Git Flow", description: "develop/main branches with feature branches" },
        { label: "GitHub Flow", description: "Feature branches merged via PR to main" }
      ]
    },
    {
      question: "What should happen when validation fails during implementation?",
      header: "Validation",
      multiSelect: false,
      options: [
        { label: "Stop on errors (Recommended)", description: "Halt workflow when tests/lint/types fail" },
        { label: "Continue with warnings", description: "Log failures but continue" }
      ]
    }
  ]
})
```

#### Step 3.2: Product Context Approach

```javascript
AskUserQuestion({
  questions: [{
    question: "Do you want to set up product context files now?",
    header: "Product Context",
    multiSelect: false,
    options: [
      { label: "Yes, guide me through it", description: "Interactive setup of vision, guidelines, constraints" },
      { label: "Create empty templates", description: "I'll fill them in later" },
      { label: "Skip product context", description: "Technical context only" }
    ]
  }]
})
```

### Phase 4: Structure Creation

#### Step 4.1: Create Directory Structure

```bash
mkdir -p .claude/product
mkdir -p .claude/context
mkdir -p .claude/specs
```

#### Step 4.2: Create Product Context Files

**If "Yes, guide me through it" was selected:**

For each product file, ask for input:

**Vision (product/vision.md):**
```javascript
AskUserQuestion({
  questions: [{
    question: "Briefly describe what your product does and why it exists (1-2 sentences):",
    header: "Product Vision",
    multiSelect: false,
    options: [
      { label: "Enter vision", description: "I'll provide a brief description" },
      { label: "Skip for now", description: "Leave as template" }
    ]
  }]
})
```

If user provides input, incorporate into the template.

**Guidelines (product/guidelines.md):**
```
Do you have specific guidelines for:
- UI/UX standards
- Brand voice/tone
- Accessibility requirements
```

**Constraints (product/constraints.md):**
```
Do you have specific constraints for:
- Performance requirements
- Compliance/regulatory
- Timeline/deadlines
```

**If "Create empty templates" or user skips:**

Read templates from `${PLUGIN_ROOT}/templates/product/` and write to `.claude/product/`.

#### Step 4.3: Create Context README

Copy `${PLUGIN_ROOT}/templates/context/README.md` to `.claude/context/README.md`.

#### Step 4.4: Create Workflow Context File

Based on git flow selection, create `.claude/context/workflow.md`:

**For Trunk-based:**
```markdown
# Workflow

## Git Strategy: Trunk-Based Development

- Main branch is always deployable
- Short-lived feature branches (<1 day ideal)
- Branch naming: `<type>/<short-description>` (e.g., `feat/user-profile`)
- Merge via squash or rebase

## Branch Types
- `feat/` - New features
- `fix/` - Bug fixes
- `refactor/` - Code improvements
- `docs/` - Documentation

## Commit Format
Conventional commits:
- `feat: add user profile page`
- `fix: resolve navigation crash`
- `refactor: simplify auth logic`

## PR Size
Target 200-400 lines of code per PR for easy review.
```

**For Git Flow:**
```markdown
# Workflow

## Git Strategy: Git Flow

- `main` - Production releases only
- `develop` - Integration branch
- `feature/*` - New features (branch from develop)
- `release/*` - Release preparation
- `hotfix/*` - Production fixes

## Branch Naming
- `feature/<ticket-or-description>`
- `release/<version>`
- `hotfix/<issue>`
```

**For GitHub Flow:**
```markdown
# Workflow

## Git Strategy: GitHub Flow

- `main` is always deployable
- Create feature branches for all changes
- Open PR for discussion and review
- Deploy from main after merge

## Branch Naming
`<username>/<description>` or `<ticket>/<description>`
```

#### Step 4.5: Create Project Config

Create `.claude/project-config.json` based on detected commands and validation preference:

```json
{
  "packageManager": "[detected]",
  "projectType": "[detected]",
  "validationGates": {
    "typescript": {
      "enabled": [true if tsc detected],
      "command": "[pm] run tsc",
      "exitOnError": [based on preference]
    },
    "lint": {
      "enabled": [true if lint detected],
      "command": "[pm] run lint",
      "autoFix": true,
      "fixCommand": "[pm] run lint --fix",
      "exitOnError": [based on preference]
    },
    "unitTests": {
      "enabled": [true if test detected],
      "command": "[pm] run test",
      "smartFileSelection": true,
      "exitOnError": false
    }
  }
}
```

#### Step 4.6: Generate CLAUDE.md

Read `${PLUGIN_ROOT}/templates/CLAUDE.md.template` and replace placeholders:

- `{{project_name}}` → From package.json or folder name
- `{{build_command}}` → Detected command
- `{{test_command}}` → Detected command
- `{{lint_command}}` → Detected command

Write to project root as `CLAUDE.md`.

### Phase 5: Brownfield Exploration (Optional)

**Only for brownfield projects, ask:**

```javascript
AskUserQuestion({
  questions: [{
    question: "Would you like me to analyze your codebase and suggest initial context files?",
    header: "Code Analysis",
    multiSelect: false,
    options: [
      { label: "Yes, analyze codebase", description: "I'll explore and suggest context files (takes 2-3 minutes)" },
      { label: "No, I'll add context manually", description: "Skip analysis, use /cdd:learn later" }
    ]
  }]
})
```

**If "Yes":**

Launch exploration using Task tool:

```javascript
Task({
  subagent_type: "Explore",
  description: "Analyze codebase for context",
  prompt: `
    Explore this codebase and identify key patterns for context files.

    Focus on:
    1. Architecture patterns (folder structure, module organization)
    2. Common code patterns (how components are structured, API patterns)
    3. Testing patterns (how tests are organized)

    For each area, provide:
    - A brief summary (2-3 sentences)
    - Key files that exemplify the pattern
    - Suggested context file name

    Do NOT create files. Return findings as a structured summary.
  `
})
```

Based on exploration results, offer to create suggested context files.

### Phase 6: Completion

#### Step 6.1: Summary

Display completion summary:

```
✅ Context-Driven Development initialized!

Created:
  CLAUDE.md                         Project entry point with ToC
  .claude/project-config.json       Validation gates configuration
  .claude/product/vision.md         [Filled/Template]
  .claude/product/guidelines.md     [Filled/Template]
  .claude/product/constraints.md    [Filled/Template]
  .claude/context/workflow.md       [Git strategy] workflow
  .claude/context/README.md         Guide for context files

Configuration:
  Package Manager: [detected]
  Project Type: [detected]
  Git Strategy: [selected]
  Validation: [Stop on errors / Continue with warnings]

Next steps:
  1. Review and customize .claude/product/ files
  2. Run /cdd:learn <topic> to create technical context
  3. Use /cdd:create when planning complex features

Quick commands:
  /cdd:health     Check context token usage
  /cdd:learn      Create context from codebase patterns
  /cdd:create     Plan a new feature
```

## Error Handling

### No package.json
```
⚠️ No package.json found

This appears to be a non-Node.js project or uninitialized directory.

Options:
1. Create package.json first: npm init -y
2. Continue with manual configuration
```

Ask user how to proceed.

### Write Permission Denied
```
❌ Cannot write to .claude/ directory

Check file permissions:
  ls -la .

You may need to run:
  chmod u+w .
```

### Templates Not Found
```
❌ Plugin templates not found

Expected location: ${PLUGIN_ROOT}/templates/

This may indicate a broken plugin installation.
Try reinstalling the context-driven-development plugin.
```

## Notes

- Run once per project to initialize
- Safe to re-run with `--reset` flag
- Generated files are starting points; customize as needed
- Workflow context is the most critical file - review it carefully
