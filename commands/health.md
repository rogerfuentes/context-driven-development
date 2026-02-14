---
name: cdd:health
description: Quick health check of the context system
---

# /cdd:health

Quick health check of the context system.

## Usage

```
/cdd:health
```

## Behavior

This is a lightweight, fast check that gives a quick overview of context health.

### Pre-flight Check

Verify `.claude/` structure exists. If not:

```
Context-Driven Development not initialized.
Run /cdd:init to set up.
```

### Gather Metrics

1. **Read all context files** and calculate tokens for each
2. **Check CLAUDE.md** line count
3. **List active specs** in `.claude/specs/`
4. **Quick validation** (no deep analysis)

### Output Format

```
=== Context Health ===

CLAUDE.md: 87 lines ✓

Product Context:
  vision.md         245 tokens ✓
  guidelines.md     312 tokens ✓
  constraints.md    198 tokens ✓
  ─────────────────────────────
  Subtotal:         755 tokens

Technical Context:
  architecture.md   523 tokens ✓
  patterns.md       891 tokens ⚠️ (large)
  api.md            412 tokens ✓
  testing.md        678 tokens ✓
  ─────────────────────────────
  Subtotal:       2,504 tokens

Active Specs:
  specs/user-profile/  (has plan.md)
  specs/auth-flow/     (has analysis.md, plan.md)

─────────────────────────────────
Total: 3,259 / 5,000 tokens (65%)
─────────────────────────────────

Status: Healthy ✓

Tips:
  • patterns.md is getting large - consider splitting
  • Run /cdd:curate for detailed analysis
```

### Status Indicators

- `✓` - Good (within targets)
- `⚠️` - Warning (approaching limits)
- `✗` - Problem (exceeds limits or missing)

### Thresholds

| Metric | Good | Warning | Problem |
|--------|------|---------|---------|
| CLAUDE.md lines | <100 | 100-150 | >150 |
| Context file tokens | <500 | 500-800 | >800 |
| Total tokens | <4000 | 4000-5000 | >5000 |

### Quick Recommendations

Based on findings, provide 1-3 actionable tips:

- If total tokens high: "Consider archiving unused context files"
- If file too large: "[filename] is large - consider splitting"
- If no context files: "Run /cdd:learn to create context from your codebase"
- If no product files filled: "Fill in product/ files to give Claude product sense"

## Comparison with /cdd:curate

| Aspect | /cdd:health | /cdd:curate |
|--------|-------------|-------------|
| Speed | Fast (<5s) | Thorough (30s+) |
| Depth | Surface metrics | Deep analysis |
| Fixes | None | Safe auto-fixes |
| Use case | Quick check | Maintenance |

## Output

- Token counts per file
- Overall health status
- Quick tips

## Notes

- Run anytime for quick status
- No changes made to files
- Use /cdd:curate for detailed analysis and fixes
