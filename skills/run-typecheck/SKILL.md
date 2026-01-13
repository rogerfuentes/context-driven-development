---
name: run-typecheck
description: Run TypeScript type checking. Invoked by /cdd:implement as validation gate.
---

# TypeScript Validation Gate

**Internal Skill** - Called by `/cdd:implement`, not directly by users.

## Purpose

Runs TypeScript compiler for type checking based on configuration in `.claude/project-config.json`.

## Execution

### Step 1: Read Configuration

```bash
cat .claude/project-config.json
```

Extract `validationGates.typescript` settings:
- `enabled`: Whether to run type check
- `command`: TypeScript command (e.g., `bun run tsc`)
- `exitOnError`: Whether to stop workflow on failure

**If not enabled:** Skip with message and return success.

### Step 2: Run Type Check

```bash
# Run configured command
[command from config]

# Common commands:
# bun run tsc
# npx tsc --noEmit
# pnpm tsc
```

### Step 3: Handle Results

**Success:**
```
✅ TypeScript: No type errors
```

**Failure with exitOnError: true:**
```
❌ TypeScript: X type errors found

[Error output with file:line:col]

Stopping workflow (exitOnError: true)
```

**Failure with exitOnError: false:**
```
⚠️ TypeScript: X type errors found but continuing (exitOnError: false)

[Error output]

Continuing to next validation gate...
```

### Step 4: Return Status

Return structured result:
- `gate`: "typescript"
- `status`: "success" | "failed" | "skipped"
- `errorCount`: Number of type errors
- `exitOnError`: From config
- `output`: Command output

## Configuration Schema

In `.claude/project-config.json`:

```json
{
  "validationGates": {
    "typescript": {
      "enabled": true,
      "command": "bun run tsc",
      "exitOnError": true
    }
  }
}
```

## Error Scenarios

### Config File Missing
```
⚠️ .claude/project-config.json not found
Skipping TypeScript validation

Run /cdd:setup to create configuration
```

### TypeScript Not Configured
```
⚠️ typescript not configured in project-config.json
Skipping TypeScript validation
```

## Common Type Errors

When reporting failures, categorize errors:

```
❌ TypeScript: 3 type errors found

Type errors by category:
- Missing types (1): src/api/client.ts:45
- Incompatible types (2): src/components/Form.tsx:23, src/utils/format.ts:12

Full output:
[tsc output]
```
