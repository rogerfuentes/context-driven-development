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
   - No templates required for implementation (coordination uses TaskList + SendMessage)

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

### Phase 4B: Parallel Execution (when --parallel is specified)

#### Phase 4B Pre-flight: Conflict Detection & Wave Planning

Check if `cdd` CLI is available (`which cdd`).

**If CLI is available:**
1. Run `cdd conflict-detect <spec-id> --json` via Bash
   - Parse JSON output
   - If `hasConflicts: true`: display the conflicting files and which streams touch them
   - Add all conflicting files to the lead's exclusive ownership list (off-limits for parallel agents)
   - Present the conflicts to the user before proceeding
2. Run `cdd wave-plan <spec-id> --json` via Bash
   - Parse JSON output for wave ordering
   - Use `phase0.sharedContracts` to guide Foundation phase
   - Launch agents in wave order: all Wave 1 streams first, wait for completion, then Wave 2, etc.
3. If cycle detected in wave plan, abort and ask user to fix dependencies in plan.md

**If CLI is NOT available:**
- Fall back to manual parsing of the Parallel Analysis section in plan.md
- Manually identify shared files from the streams table

**Lead-Owns-Shared-Files Pattern** (CRITICAL):
- The lead agent (you) owns ALL shared files: entry points, barrel exports, type definitions, config files
- Parallel agents create NEW files only — they must NEVER modify files that other agents touch
- If a parallel agent needs changes to a shared file, it creates a separate integration file and reports back

#### Phase 4B.0: Foundation (Lead, Sequential)

1. Build shared types, interfaces, and constants that parallel agents will need
2. Create any shared infrastructure files
3. Verify baseline tests pass

#### Phase 4B.1: Parallel Execution

For each independent work stream:
1. Use `TaskCreate` to create a task with:
   - Clear scope: exact files to create, functions to implement
   - Deliverables: list of files the agent will produce
   - Constraints: which files are OFF-LIMITS (shared files)
2. Launch an Agent for each task
3. Each agent uses `TaskUpdate` to report progress
4. If an agent is blocked, it uses `SendMessage` to notify the lead
5. Lead monitors via `TaskList` and `TaskGet`

#### Phase 4B.2: Integration (Lead, Sequential)

1. Wire up parallel agents' output into shared files (imports, exports, CLI registration)
2. Run full validation suite
3. Resolve any integration issues

```javascript
Skill({ skill: "run-typecheck" })
Skill({ skill: "run-lint" })
Skill({ skill: "run-tests" })
```

**Anti-patterns to AVOID:**
- NEVER let parallel agents modify the same file (ALWAYS fails)
- NEVER use coordination.md (agents use TaskList + SendMessage instead)
- NEVER skip the lead-owns-shared-files pattern

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

#### Step 5.3: Test Enforcement Gate

After validation completes, check if the plan includes test requirements:

1. Parse plan.md for steps that mention "test" in their description or acceptance criteria
2. If test steps exist, check if test files were created or modified during implementation:
   - Look for files matching `**/*.test.*`, `**/*.spec.*`, `**/__tests__/**` in the git diff
3. If test ACs exist but NO test files were created/modified:

   ```
   TEST ENFORCEMENT: BLOCKED

   The plan includes test requirements but no test files were created:
     - [list test-related steps from plan.md]

   You must write the required tests before completing implementation.
   Do NOT skip this step or defer it to a later PR.
   ```

4. Resume implementation to write the missing tests, then re-run validation

### Phase 5.5: Auto-Summary Generation

Generate an implementation summary from actual data:

1. Run `git diff --stat` against the baseline (before implementation started) to get files changed
2. Run `git log --oneline` for commits made during implementation
3. Cross-reference with plan.md checkboxes to determine AC status

4. Write summary to `[spec-path]/summary.md`:

   ```markdown
   # Implementation Summary: [spec-id]

   ## Changes
   - [N] files modified, [M] files created, [D] files deleted
   - [list from git diff --stat]

   ## Commits
   - [list from git log --oneline]

   ## Acceptance Criteria
   - [x] Step 1: [description]
   - [x] Step 2: [description]
   - [ ] Step 6: Unit tests (MISSING — test enforcement triggered)

   ## Validation Results
   - TypeScript: PASS
   - Lint: PASS
   - Tests: [N] passing, [M] failing
   ```

This summary serves as a permanent audit trail. When context windows expire across sessions, the summary survives.

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
# → Builds shared foundation (types, interfaces)
# → Creates tasks via TaskCreate for each stream
# → Launches parallel agents
# → Lead integrates results into shared files
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
- Auto-summary is generated before completion for audit trail
- Test enforcement prevents skipping planned tests
