---
name: cdd:implement
description: Execute an implementation plan created by /cdd:create
argument-hint: <spec-id> [--parallel] [--worktree]
---

# Context-Driven Development: Implement Command

Execute the implementation plan for a spec, with optional parallel execution and worktree isolation.

## Usage

```bash
/cdd:implement add-user-auth
/cdd:implement add-user-auth --parallel
/cdd:implement add-user-auth --worktree
/cdd:implement add-user-auth --parallel --worktree
```

## Arguments

- `spec-id` (required): The spec identifier (folder name in `.claude/specs/`)
- `--parallel`: Use coordinated sub-agents for parallel streams (requires plan support)
- `--worktree`: Isolate work in a git worktree for safe rollback

## Important: Template Path Resolution

**CRITICAL**: Template paths must resolve to the plugin installation directory.

1. **Determine plugin root** (try in order):
   - **Package install**: `packages/claude-plugins/context-driven-development/`
   - **Development mode**: `.claude/plugins/context-driven-development/`
   - **Marketplace install**: `~/.claude/plugins/marketplaces/context-driven-development/`
   - **Direct install**: `~/.claude/plugins/context-driven-development/`
   - Store as `PLUGIN_ROOT` for reuse

2. **Read templates using**:
   - `${PLUGIN_ROOT}/templates/specs/coordination.md.template`

## Process

### Phase 1: Pre-flight Checks

#### Step 1.1: Verify Spec Exists

```bash
ls .claude/specs/[spec-id]/plan.md 2>/dev/null
```

**If not found:**
```
❌ Spec not found: [spec-id]

Available specs:
[list of .claude/specs/*/]

Run /cdd:create "[description]" to create a new spec.
```

#### Step 1.2: Load Plan

```bash
cat .claude/specs/[spec-id]/plan.md
```

Parse:
- Steps list
- Parallel analysis (if present)
- Validation requirements

#### Step 1.3: Check Git Status

```bash
git status --porcelain
```

**If uncommitted changes:**

Use **AskUserQuestion**:
```javascript
AskUserQuestion({
  questions: [{
    question: "You have uncommitted changes. How would you like to proceed?",
    header: "Git Status",
    multiSelect: false,
    options: [
      { label: "Stash changes", description: "Stash current changes and proceed" },
      { label: "Continue anyway", description: "Proceed with uncommitted changes (risky)" },
      { label: "Cancel", description: "Commit or stash manually first" }
    ]
  }]
})
```

#### Step 1.4: Validate Parallel Support (if --parallel)

Check plan.md for parallel analysis section:

**If "Can parallelize? No" or section missing:**
```
⚠️ Parallel execution not supported for this spec

Reason: [from plan.md or "No parallel analysis found"]

Options:
1. Run without --parallel flag
2. Update plan with parallel analysis (/cdd:create --full)
```

Use **AskUserQuestion** to let user choose.

### Phase 2: Worktree Setup (if --worktree)

#### Step 2.1: Invoke use-worktrees Skill

```javascript
Skill({ skill: "use-worktrees" })
```

The skill will:
1. Check if already in worktree
2. Create worktree directory
3. Create feature branch
4. Install dependencies
5. Verify baseline tests pass

#### Step 2.2: Record Worktree Path

Store worktree path for later cleanup:
- `WORKTREE_PATH`: Full path to worktree
- `WORKTREE_BRANCH`: Branch name

### Phase 3: Context Loading

#### Step 3.1: Load Project Context

Read:
1. **CLAUDE.md** - Project overview
2. **Relevant context files** - Based on files in plan
3. **Project config** - `.claude/project-config.json`
4. **Analysis** (if exists) - `.claude/specs/[spec-id]/analysis.md`

#### Step 3.2: Load Validation Gates

From `.claude/project-config.json`:

```javascript
const config = JSON.parse(read('.claude/project-config.json'));
const gates = config.validationGates || {};
```

### Phase 4A: Single Agent Execution (default)

**If NOT --parallel:**

#### Step 4A.1: Execute Steps Sequentially

For each step in plan.md:

1. **Mark step in progress** - Update plan.md checkbox
2. **Implement the step** - Make code changes
3. **Run relevant validation** - After significant changes
4. **Mark step complete** - Update plan.md checkbox
5. **Report progress** - Show completion status

**Progress format:**
```
Step 2/7: Add authentication API client
  Creating src/api/auth.ts...
  ✓ File created
  Running validation...
  ✓ TypeScript: No errors
  ✓ Step complete
```

#### Step 4A.2: Run Validation Gates

After all steps complete, run full validation:

```javascript
// Run each enabled gate via skills
if (gates.typescript?.enabled) {
  Skill({ skill: "run-typecheck" })
}

if (gates.lint?.enabled) {
  Skill({ skill: "run-lint" })
}

if (gates.unitTests?.enabled) {
  Skill({ skill: "run-tests" })
}
```

**If any gate fails with exitOnError: true:**
- Stop execution
- Report failure
- Suggest fixes

### Phase 4B: Parallel Execution (if --parallel)

#### Step 4B.1: Read Coordination Template

```bash
cat ${PLUGIN_ROOT}/templates/specs/coordination.md.template
```

#### Step 4B.2: Extract Parallel Streams from Plan

From plan.md's Parallel Analysis section, extract:
- Stream names
- Steps per stream
- Files per stream
- Dependencies
- Shared contracts

#### Step 4B.3: Create Coordination File

Create `.claude/specs/[spec-id]/coordination.md`:

```markdown
# Coordination: [spec-id]

## Contracts

```typescript
// Shared types - ALL agents must use these
[Copy from plan.md Shared Contracts section]
```

## Agent Assignments

### Agent: [stream-name]
**Scope:** [files from plan]
**Steps:** [step numbers from plan]
**Deliverables:**
- [List what this agent must produce]
**Must use:** Types from Contracts section
**Tests:** [Testing requirements]

[Repeat for each parallel stream]

## Execution Order

1. **Parallel:** [streams that run together]
2. **Sequential:** [streams that depend on parallel phase]
3. **Integration:** Main agent validates and integrates

## Completion Checklist

- [ ] [stream-1]: pending
- [ ] [stream-2]: pending
- [ ] Integration: pending
- [ ] Validation: pending
```

#### Step 4B.4: Define Shared Contracts First

Before launching agents, implement shared types/interfaces:

1. Create shared type files
2. Run typecheck to verify
3. Commit shared contracts

This ensures all agents use consistent interfaces.

#### Step 4B.5: Launch Parallel Agents

For each parallel stream, launch a sub-agent:

```javascript
// Launch ALL parallel streams in a single message with multiple Task calls
Task({
  subagent_type: "general-purpose",
  description: "Implement [stream-name]",
  prompt: `
    You are implementing the '[stream-name]' stream.

    IMPORTANT: Read the coordination file first:
    .claude/specs/[spec-id]/coordination.md

    Your assignment:
    - Scope: [files]
    - Steps: [step numbers]
    - Deliverables: [what to create]

    Rules:
    1. ONLY modify files within your scope
    2. Use ONLY the types defined in the Contracts section
    3. Create tests for your deliverables
    4. Do NOT modify files outside your scope
    5. Follow patterns from context files

    When complete, report:
    - Files created/modified
    - Tests created
    - Any issues encountered
  `
})
```

**CRITICAL:** Launch all parallel agents in a single message to execute concurrently.

#### Step 4B.6: Wait for Parallel Completion

Monitor agent completion:
- Update coordination.md checklist as agents complete
- Log any reported issues
- Track files changed by each agent

#### Step 4B.7: Sequential Phase

After parallel streams complete:
- Execute any sequential steps that depend on parallel work
- This runs as main agent
- Often includes integration steps

#### Step 4B.8: Integration Validation

Main agent:
1. Verify all pieces work together
2. Fix any integration issues
3. Run full validation suite

```javascript
Skill({ skill: "run-typecheck" })
Skill({ skill: "run-lint" })
Skill({ skill: "run-tests" })
```

### Phase 5: Validation

#### Step 5.1: Run All Validation Gates

Execute validation skills in order:

```javascript
// TypeScript
if (gates.typescript?.enabled) {
  const result = await Skill({ skill: "run-typecheck" });
  if (result.status === "failed" && gates.typescript.exitOnError) {
    // Handle failure
  }
}

// Lint (with auto-fix if enabled)
if (gates.lint?.enabled) {
  const result = await Skill({ skill: "run-lint" });
  if (result.status === "failed" && gates.lint.exitOnError) {
    // Handle failure
  }
}

// Tests
if (gates.unitTests?.enabled) {
  const result = await Skill({ skill: "run-tests" });
  if (result.status === "failed" && gates.unitTests.exitOnError) {
    // Handle failure
  }
}
```

#### Step 5.2: Handle Validation Failures

**If validation fails:**

```
❌ Validation failed: [gate name]

[Error details]

Options:
1. Fix issues and retry validation
2. Continue with warnings (not recommended)
3. Abort implementation
```

Use **AskUserQuestion** to let user choose.

### Phase 6: Completion

#### Step 6.1: Worktree Merge (if --worktree)

**On success:**

Use **AskUserQuestion**:
```javascript
AskUserQuestion({
  questions: [{
    question: "Implementation complete. How would you like to handle the worktree?",
    header: "Worktree",
    multiSelect: false,
    options: [
      { label: "Merge and cleanup", description: "Merge branch to main and remove worktree" },
      { label: "Keep worktree", description: "Keep for further work or review" },
      { label: "Discard", description: "Delete worktree and branch (lose changes)" }
    ]
  }]
})
```

**If "Merge and cleanup":**
```bash
cd [main-repo]
git merge [worktree-branch]
git worktree remove [worktree-path]
git branch -d [worktree-branch]
```

**On failure:**

```
Implementation failed in worktree.

Options:
1. Keep worktree and fix issues manually
2. Discard worktree (lose all changes)
```

#### Step 6.2: Update Spec Status

Update CLAUDE.md's Active Specs table:

```markdown
## Active Specs
| Spec | Status |
|------|--------|
| `specs/[spec-id]/` | ✅ Implemented |
```

#### Step 6.3: Suggest Next Steps

```
✅ Implementation complete: [spec-id]

Summary:
  Steps completed: [N]/[N]
  Validation: All passed
  [If parallel:] Parallel streams: [N] completed

Files changed:
  - [list of files]

Next steps:
  1. Review changes and test manually
  2. Create PR when ready: git push && gh pr create
  3. After merge, run /cdd:learn to capture new patterns
  4. Clean up spec: rm -rf .claude/specs/[spec-id]
```

#### Step 6.4: Offer Context Learning

Use **AskUserQuestion**:
```javascript
AskUserQuestion({
  questions: [{
    question: "Would you like to capture any patterns from this implementation as context files?",
    header: "Learn Patterns",
    multiSelect: false,
    options: [
      { label: "Yes, run /cdd:learn", description: "Analyze and create context files" },
      { label: "No, I'm done", description: "Skip pattern capture" }
    ]
  }]
})
```

## Error Handling

### Spec Not Found
```
❌ Spec not found: [spec-id]

Run /cdd:create "[description]" to create a new spec.
```

### Parallel Not Supported
```
⚠️ This spec doesn't support parallel execution

The plan shows: Can parallelize? No

Run without --parallel flag:
/cdd:implement [spec-id]
```

### Validation Gate Failed
```
❌ Validation failed: TypeScript

src/api/auth.ts:45:12 - error TS2345: Argument of type 'string' is not assignable

Stopping workflow (exitOnError: true)

Options:
1. Fix the type error and retry
2. Continue anyway (not recommended)
```

### Worktree Creation Failed
```
❌ Failed to create worktree

[Error from git]

Options:
1. Try without worktree
2. Fix git issue manually
```

### Sub-Agent Failed (Parallel Mode)
```
⚠️ Parallel agent failed: [stream-name]

[Agent error details]

Completed streams:
  ✓ [stream-1]
  ✗ [stream-2]

Options:
1. Retry failed stream only
2. Continue with completed work
3. Abort and rollback
```

## Examples

```bash
# Simple single-agent execution
/cdd:implement add-user-auth
# → Executes steps sequentially
# → Runs validation gates
# → Reports completion

# Parallel execution
/cdd:implement add-user-auth --parallel
# → Creates coordination.md
# → Defines shared contracts
# → Launches parallel agents
# → Integrates results
# → Runs validation

# Isolated worktree execution
/cdd:implement add-user-auth --worktree
# → Creates worktree
# → Implements in isolation
# → Offers merge/discard on completion

# Full parallel + isolation
/cdd:implement add-user-auth --parallel --worktree
# → Creates worktree
# → Runs parallel agents
# → Validates and integrates
# → Offers merge/discard
```

## Notes

- Always review the plan before implementing
- Use --worktree for risky changes (easy rollback)
- --parallel requires plan to have parallel analysis
- Validation gates are configured in project-config.json
- Skills handle the actual validation execution
- Clean up specs after successful implementation
