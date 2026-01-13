---
name: use-worktrees
description: Creates isolated git worktrees for workspace isolation. Invoked by /cdd:implement --worktree.
---

# Git Worktrees

**Internal Skill** - Called by `/cdd:implement`, not directly by users.

## Overview

Git worktrees create isolated workspaces sharing the same repository, allowing work on multiple branches simultaneously.

**Key distinction:** Worktrees provide **workspace isolation**, NOT parallel execution. For true parallelism, combine worktrees with sub-agents (Task tool).

## Execution

### Step 1: Check if Already in Worktree

```bash
# CRITICAL: Must check before creating
git rev-parse --git-dir 2>/dev/null | grep -q '\.git/worktrees'
```

**If already in worktree:**
```
❌ ERROR: Already inside a worktree!
Current location: [pwd]
Main repository: [path]

Navigate to main repository first:
cd [main-repo-path]
```

**Why critical:** Creating worktrees from inside another worktree causes nested paths and broken setups.

### Step 2: Determine Directory Location

Check in priority order:

1. **Existing directory:**
   ```bash
   ls -d .worktrees 2>/dev/null   # Preferred
   ls -d worktrees 2>/dev/null    # Alternative
   ```

2. **CLAUDE.md preference:**
   ```bash
   grep -i "worktree.*directory" CLAUDE.md 2>/dev/null
   ```

3. **Ask user:**
   ```
   No worktree directory found. Where should I create worktrees?

   1. .worktrees/ (project-local, hidden) - Recommended
   2. worktrees/ (project-local, visible)
   ```

### Step 3: Verify .gitignore (for project-local)

**MUST verify before creating:**

```bash
grep -q "^\.worktrees/$\|^worktrees/$" .gitignore
```

**If NOT in .gitignore:**
1. Add appropriate line
2. Commit the change
3. Then proceed

### Step 4: Create Worktree

```bash
# Get project name
project=$(basename "$(git rev-parse --show-toplevel)")

# Create with new branch
git worktree add ".worktrees/$BRANCH_NAME" -b "$BRANCH_NAME"

# Change to worktree
cd ".worktrees/$BRANCH_NAME"
```

### Step 5: Fix Husky Hooks (if present)

```bash
if [ -d .husky ] && [ ! -d .husky/_ ]; then
  echo "Fixing Husky setup in worktree..."
  mkdir -p .husky/_

  MAIN_REPO=$(git rev-parse --git-common-dir | sed 's|/.git$||')

  if [ -f "$MAIN_REPO/.husky/_/husky.sh" ]; then
    cp "$MAIN_REPO/.husky/_/husky.sh" .husky/_/
    echo "✅ Husky hooks enabled"
  fi
fi
```

### Step 6: Run Project Setup

Auto-detect and run:

```bash
# Detect package manager and install
if [ -f bun.lock ]; then bun install
elif [ -f pnpm-lock.yaml ]; then pnpm install
elif [ -f yarn.lock ]; then yarn install
elif [ -f package-lock.json ]; then npm install
fi
```

### Step 7: Verify Clean Baseline

Run validation to ensure worktree starts clean:

```bash
# Run type check and lint
bun run tsc
bun run lint
```

**If fails:** Report and ask whether to proceed or investigate.

### Step 8: Report Ready

```
✅ Worktree ready at [full-path]
Branch: [branch-name]
Tests passing

Ready to implement [feature-name]
```

## Cleanup

When work is complete, use `/cdd:implement` cleanup or manually:

```bash
# Return to main repo
cd [main-repo-path]

# Merge if desired
git merge [branch-name]

# Remove worktree
git worktree remove .worktrees/[branch-name]

# Delete branch if merged
git branch -d [branch-name]
```

## Quick Reference

| Situation | Action |
|-----------|--------|
| `.worktrees/` exists | Use it (verify .gitignore) |
| Already in worktree | ERROR - navigate to main repo |
| Husky hooks present | Auto-copy husky.sh from main repo |
| Tests fail baseline | Report + ask to proceed |

## Common Mistakes

1. **Creating worktree from inside another** - Always check first
2. **Skipping .gitignore verification** - Worktree contents get tracked
3. **Not fixing Husky** - Hooks fail with missing husky.sh
4. **Proceeding with failing tests** - Can't distinguish new vs existing bugs
