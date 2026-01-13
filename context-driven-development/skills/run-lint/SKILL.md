---
name: run-lint
description: Run linter with optional auto-fix. Invoked by /cdd:implement as validation gate.
---

# Lint Validation Gate

**Internal Skill** - Called by `/cdd:implement`, not directly by users.

## Purpose

Runs linter based on configuration in `.claude/project-config.json`, with support for auto-fix.

## Execution

### Step 1: Read Configuration

```bash
cat .claude/project-config.json
```

Extract `validationGates.lint` settings:
- `enabled`: Whether to run linter
- `command`: Lint command (e.g., `bun run lint`)
- `autoFix`: Whether to auto-fix issues
- `fixCommand`: Command to fix issues (e.g., `bun run lint --fix`)
- `exitOnError`: Whether to stop workflow on failure

**If not enabled:** Skip with message and return success.

### Step 2: Run Lint Check

```bash
# Run configured command
[command from config]
```

### Step 3: Handle Auto-Fix (if enabled and errors found)

**If `autoFix: true` AND lint found issues:**

```bash
# Run fix command
[fixCommand from config]

# Re-run lint to verify
[command from config]
```

### Step 4: Handle Results

**Success:**
```
✅ Lint: No issues found
```

**Success after auto-fix:**
```
✅ Lint: Issues auto-fixed
   Fixed X files
```

**Failure with exitOnError: true:**
```
❌ Lint: X issues found

[Error output]

Stopping workflow (exitOnError: true)
```

**Failure with exitOnError: false:**
```
⚠️ Lint: X issues found but continuing (exitOnError: false)

[Error output]

Continuing to next validation gate...
```

### Step 5: Return Status

Return structured result:
- `gate`: "lint"
- `status`: "success" | "failed" | "skipped"
- `autoFixed`: true/false
- `exitOnError`: From config
- `output`: Command output

## Configuration Schema

In `.claude/project-config.json`:

```json
{
  "validationGates": {
    "lint": {
      "enabled": true,
      "command": "bun run lint",
      "autoFix": true,
      "fixCommand": "bun run lint --fix",
      "exitOnError": true
    }
  }
}
```

## Error Scenarios

### Config File Missing
```
⚠️ .claude/project-config.json not found
Skipping lint validation

Run /cdd:setup to create configuration
```

### Auto-Fix Failed
```
⚠️ Lint auto-fix attempted but issues remain

[Remaining issues]

Manual fixes required for:
- src/file.ts: [issue description]
```
