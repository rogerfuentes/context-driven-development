---
name: run-tests
description: Run unit tests after code changes. Invoked by /cdd:implement as validation gate.
---

# Unit Tests Validation Gate

**Internal Skill** - Called by `/cdd:implement`, not directly by users.

## Purpose

Runs unit tests based on configuration in `.claude/project-config.json`, with support for smart file selection.

## Execution

### Step 1: Read Configuration

```bash
# Read project configuration
cat .claude/project-config.json
```

Extract `validationGates.unitTests` settings:
- `enabled`: Whether to run tests
- `command`: Test command (e.g., `bun run test`)
- `smartFileSelection`: Whether to only test changed files
- `exitOnError`: Whether to stop workflow on failure

**If not enabled or not configured:** Skip with message and return success.

### Step 2: Determine Test Scope

**If `smartFileSelection: true`:**

```bash
# Get changed files
git diff --name-only HEAD

# Filter for test files
# Look for .test. or .spec. in filename
```

- If test files found: Run only those tests
- If no test files changed: Run full suite

**If `smartFileSelection: false`:** Run full suite.

### Step 3: Execute Tests

```bash
# Run configured command
[command from config]

# Examples:
# Full suite: bun run test
# Smart selection: bun run test src/components/Button.test.tsx
```

### Step 4: Handle Results

**Success:**
```
✅ Unit Tests: All tests passed (X suites, Y tests)
```

**Success with smart selection:**
```
✅ Unit Tests: All tests passed (X suites, Y tests)
Note: Smart file selection - only ran tests for changed files
```

**Failure with exitOnError: true:**
```
❌ Unit Tests: X tests failed

[Error output]

Stopping workflow (exitOnError: true)
```

**Failure with exitOnError: false:**
```
⚠️ Unit Tests: X tests failed but continuing (exitOnError: false)

[Error output]

Continuing to next validation gate...
```

### Step 5: Return Status

Return structured result:
- `gate`: "unitTests"
- `status`: "success" | "failed" | "skipped"
- `exitOnError`: From config
- `output`: Command output

## Configuration Schema

In `.claude/project-config.json`:

```json
{
  "validationGates": {
    "unitTests": {
      "enabled": true,
      "command": "bun run test",
      "smartFileSelection": true,
      "exitOnError": false
    }
  }
}
```

## Error Scenarios

### Config File Missing
```
⚠️ .claude/project-config.json not found
Skipping unit tests validation

Run /cdd:setup to create configuration
```

### Gate Not Configured
```
⚠️ unitTests not configured in project-config.json
Skipping unit tests validation
```
