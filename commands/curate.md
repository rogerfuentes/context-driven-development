---
name: cdd:curate
description: Validate, optimize, and maintain context files
---

# /cdd:curate

Validate, optimize, and maintain context files.

## Usage

```
/cdd:curate
/cdd:curate --scope [claude-md|product|context|all]
/cdd:curate --fix
```

## Arguments

- `--scope`: What to curate
  - `claude-md`: Only CLAUDE.md
  - `product`: Only product/ files
  - `context`: Only context/ files
  - `all` (default): Everything

- `--fix`: Automatically apply safe fixes

## Behavior

### Pre-flight Checks

1. Verify `.claude/` structure exists
2. Read all context files into memory for analysis

### Analysis Phase

Perform the following checks:

#### 1. Duplicate Content Detection

Scan for repeated information across files:

```
Checking for duplicates...

Found potential duplicates:
  - "API endpoints should use camelCase" appears in:
    - context/api.md (line 12)
    - context/naming.md (line 8)

  Suggestion: Keep in context/api.md, remove from context/naming.md
```

#### 2. Outdated References

Check for references to non-existent files/functions:

```
Checking for outdated references...

Found outdated references:
  - context/architecture.md references "src/utils/helpers.ts"
    File not found in codebase

  Suggestion: Update or remove this reference
```

Verify by checking if referenced files exist:
```bash
ls [referenced_file] 2>/dev/null
```

#### 3. Token Budget Analysis

Calculate tokens for each file and total:

```
Token Budget Analysis:

CLAUDE.md:              87 tokens
product/vision.md:     245 tokens
product/guidelines.md: 312 tokens
product/constraints.md: 198 tokens
context/architecture.md: 523 tokens
context/patterns.md:    891 tokens  ⚠️ Large
context/testing.md:     678 tokens

Total: 2,934 / 5,000 tokens (59%)

Recommendations:
  - context/patterns.md is large (891 tokens)
    Consider splitting into smaller focused files
```

#### 4. Unused Files Detection

Check which context files haven't been referenced recently:

```
Checking file usage...

Potentially unused files:
  - context/old-api.md
    Not referenced in CLAUDE.md table
    Consider removing or updating CLAUDE.md
```

#### 5. Conflict Detection

Look for contradictory instructions:

```
Checking for conflicts...

Potential conflicts found:
  - context/api.md says: "Use snake_case for API fields"
  - context/patterns.md says: "Use camelCase everywhere"

  Resolution needed: Which convention applies to API fields?
```

#### 6. CLAUDE.md Quality Check

Verify CLAUDE.md follows best practices:

- Line count (target: <100, max: 150)
- Has commands section
- Has product context table
- Has technical context table
- Table entries have "Load when..." descriptions

### Report Generation

Generate a summary report:

```
=== Context Curation Report ===

Scope: all
Files analyzed: 8

Issues Found:
  [HIGH]   2 outdated references
  [MEDIUM] 1 duplicate content
  [LOW]    1 large file (patterns.md)

Token Budget: 2,934 / 5,000 (59%) ✓

Safe Auto-fixes Available: 2
  - Remove duplicate in naming.md
  - Update CLAUDE.md line count

Run with --fix to apply safe fixes automatically.
```

### Fix Mode

When `--fix` is provided:

1. Apply only safe fixes:
   - Remove exact duplicates
   - Fix formatting issues
   - Update token counts

2. Report what was fixed:
   ```
   Applied fixes:
     ✓ Removed duplicate from context/naming.md
     ✓ Fixed markdown formatting in context/api.md

   Manual action required:
     - Update outdated reference in context/architecture.md
     - Resolve conflict between api.md and patterns.md
   ```

3. Never auto-fix:
   - Content conflicts (needs human decision)
   - Outdated references (might need investigation)
   - File removal (too destructive)

## Output

- Detailed report of findings
- List of applied fixes (if --fix)
- Recommendations for manual fixes

## Examples

```
# Full curation check
/cdd:curate

# Check only context files
/cdd:curate --scope context

# Auto-fix safe issues
/cdd:curate --fix

# Check and fix context files
/cdd:curate --scope context --fix
```

## Notes

- Run periodically to maintain context quality
- Run after major refactors to catch outdated references
- Safe to run frequently; read-only by default
