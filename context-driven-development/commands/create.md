---
name: cdd:create
description: Create a spec with analysis and implementation plan for a feature or task
argument-hint: <description> [--quick|--full]
---

# Context-Driven Development: Create Command

Analyze current implementation and create an implementation plan for a feature or task.

## Usage

```bash
/cdd:create "add user authentication"
/cdd:create "refactor navigation" --quick
/cdd:create "implement payment flow" --full
```

## Arguments

- `description` (required): What you want to build or change
- `--quick`: Skip detailed analysis, create minimal plan
- `--full`: Full analysis with parallelization assessment (default for complex features)

## Important: Template Path Resolution

**CRITICAL**: Template paths must resolve to the plugin installation directory.

1. **Determine plugin root** (try in order):
   - **Package install**: `packages/claude-plugins/context-driven-development/`
   - **Development mode**: `.claude/plugins/context-driven-development/`
   - **Direct install**: `~/.claude/plugins/context-driven-development/`
   - Store as `PLUGIN_ROOT` for reuse

2. **Read templates using**:
   - `${PLUGIN_ROOT}/templates/specs/analysis.md.template`
   - `${PLUGIN_ROOT}/templates/specs/plan.md.template`

## Process

### Phase 1: Pre-flight Checks

#### Step 1.1: Verify CDD Initialization

```bash
ls .claude/context/ 2>/dev/null
ls CLAUDE.md 2>/dev/null
```

**If not initialized:**
```
❌ Context-Driven Development not set up

Run /cdd:setup first to initialize the project structure.
```

#### Step 1.2: Generate Spec ID

Create a unique spec identifier from the description:
- Take first 5-7 words
- Convert to kebab-case
- Remove special characters
- Max 50 characters

Example: "add user authentication with OAuth" → `add-user-authentication-with-oauth`

#### Step 1.3: Check for Existing Spec

```bash
ls .claude/specs/[spec-id]/ 2>/dev/null
```

**If exists:**

Use **AskUserQuestion**:
```javascript
AskUserQuestion({
  questions: [{
    question: "A spec already exists for this feature. What would you like to do?",
    header: "Existing Spec",
    multiSelect: false,
    options: [
      { label: "View existing", description: "Show current analysis and plan" },
      { label: "Replace", description: "Create new spec (overwrites existing)" },
      { label: "Cancel", description: "Keep existing spec" }
    ]
  }]
})
```

### Phase 2: Context Loading

#### Step 2.1: Load Project Context

Read and understand:

1. **CLAUDE.md** - Project overview and commands
2. **Product context** (if exists):
   - `.claude/product/vision.md`
   - `.claude/product/guidelines.md`
   - `.claude/product/constraints.md`
3. **Technical context**:
   - `.claude/context/workflow.md`
   - Other `.claude/context/*.md` files relevant to the task
4. **Project config**:
   - `.claude/project-config.json` for validation gates

#### Step 2.2: Identify Relevant Context Files

Based on the feature description, determine which context files are relevant.

Read CLAUDE.md's ToC and load files matching the task:
- Navigation changes → load `context/navigation.md`
- API changes → load `context/api.md`
- Testing needs → load `context/testing.md`

### Phase 3: Codebase Exploration

#### Step 3.1: Explore Current Implementation

Launch exploration to understand current state:

```javascript
Task({
  subagent_type: "Explore",
  description: "Analyze current implementation",
  prompt: `
    Analyze the codebase to understand current implementation related to:
    "${description}"

    Find and document:
    1. Existing files that will be modified
    2. Patterns currently used for similar functionality
    3. Dependencies and imports that will be affected
    4. Testing patterns for this area of code

    Return structured findings:
    - Relevant files (list with brief description)
    - Current patterns (how similar things are done)
    - Gaps (what doesn't exist yet)
    - Dependencies (what this connects to)
  `
})
```

#### Step 3.2: Quick Mode Skip

**If `--quick` flag:**
- Skip detailed exploration
- Use description directly for plan
- Jump to Phase 5 (Plan Creation)

### Phase 4: Analysis Creation (Skip if --quick)

#### Step 4.1: Read Analysis Template

```bash
cat ${PLUGIN_ROOT}/templates/specs/analysis.md.template
```

#### Step 4.2: Fill Analysis Template

Create `.claude/specs/[spec-id]/analysis.md` with:

**Current State Section:**
- List existing files from exploration
- Document current patterns
- Note dependencies

**Gap Analysis Section:**
- New files needed
- Modifications to existing files
- New tests required

**Constraints Section:**
- Technical constraints from context files
- Product constraints from product/ files
- Dependencies on other systems

#### Step 4.3: User Review - Analysis

**⚠️ MANDATORY STOP POINT ⚠️**

Use **AskUserQuestion**:
```javascript
AskUserQuestion({
  questions: [{
    question: "Analysis complete. Saved to .claude/specs/[spec-id]/analysis.md\n\nKey findings: [2-3 sentence summary]\n\nPlease review before I create the implementation plan.",
    header: "Review Analysis",
    multiSelect: false,
    options: [
      { label: "Approved - Continue to Plan", description: "Analysis looks good, create implementation plan" },
      { label: "Request Changes", description: "I have feedback on the analysis" }
    ]
  }]
})
```

**If "Request Changes":**
- Ask: "What changes would you like?"
- Update analysis based on feedback
- Re-present for approval
- **LOOP** until approved

**DO NOT proceed to plan until analysis is approved.**

### Phase 5: Plan Creation

#### Step 5.1: Read Plan Template

```bash
cat ${PLUGIN_ROOT}/templates/specs/plan.md.template
```

#### Step 5.2: Assess Complexity

Determine implementation complexity:

| Complexity | Criteria | Plan Depth |
|------------|----------|------------|
| **Simple** | <50 LOC, single file | Steps only |
| **Standard** | 50-200 LOC, 2-4 files | Steps + validation |
| **Complex** | >200 LOC, 5+ files | Full plan with parallel analysis |

#### Step 5.3: Fill Plan Template

Create `.claude/specs/[spec-id]/plan.md` with:

**Overview Section:**
- 1-2 sentence summary of what will be built

**Steps Section:**
- Numbered list of implementation steps
- Each step should be:
  - Actionable (starts with verb)
  - Scoped (affects specific files)
  - Testable (can verify completion)

**Example steps:**
```markdown
## Steps

1. [ ] Create UserAuth component in src/components/
2. [ ] Add authentication API client in src/api/auth.ts
3. [ ] Implement auth state management in src/stores/auth.ts
4. [ ] Add login screen in src/screens/LoginScreen.tsx
5. [ ] Integrate auth with navigation in src/navigation/
6. [ ] Add unit tests for auth logic
7. [ ] Add integration tests for login flow
```

#### Step 5.4: Parallel Analysis (if Complex or --full)

**Only for complex features or when --full flag used:**

Analyze if work can be parallelized:

**Questions to assess:**
- Are there independent work streams?
- Can types/interfaces be defined upfront?
- Do any steps have no dependencies on others?

**Parallel Analysis Section:**

```markdown
## Parallel Analysis

### Can parallelize?
[Yes/No]

### Reason
[Explanation of why or why not]

### Parallel Streams (if Yes)
| Stream | Steps | Files | Dependencies |
|--------|-------|-------|--------------|
| [name] | [#s] | [files] | [what it needs] |

### Shared Contracts (if Yes)
```typescript
// Types that must be defined before parallel work begins
interface [SharedType] { ... }
```

### Recommendation
[Single agent / Parallel with coordination]
```

**If NOT parallelizable:**
```markdown
## Parallel Analysis

### Can parallelize?
No

### Reason
Steps are sequential - each depends on the previous step's output.

### Recommendation
Single agent execution. Use `/cdd:implement [spec-id]` without --parallel flag.
```

#### Step 5.5: Validation Section

Add validation requirements:

```markdown
## Validation

- [ ] TypeScript compiles without errors
- [ ] All tests pass
- [ ] Lint checks pass
- [ ] [Feature-specific validations]
```

#### Step 5.6: User Review - Plan

**⚠️ MANDATORY STOP POINT ⚠️**

Use **AskUserQuestion**:
```javascript
AskUserQuestion({
  questions: [{
    question: "Plan complete. Saved to .claude/specs/[spec-id]/plan.md\n\nApproach: [2-3 sentence summary]\nParallel: [Yes/No]\n\nPlease review the implementation plan.",
    header: "Review Plan",
    multiSelect: false,
    options: [
      { label: "Approved - Ready to Implement", description: "Plan looks good" },
      { label: "Request Changes", description: "I have feedback on the plan" }
    ]
  }]
})
```

**If "Request Changes":**
- Ask: "What changes would you like?"
- Update plan based on feedback
- Re-present for approval
- **LOOP** until approved

### Phase 6: Completion

#### Step 6.1: Update CLAUDE.md Active Specs

Add entry to CLAUDE.md's Active Specs table:

```markdown
## Active Specs
| Spec | Status |
|------|--------|
| `specs/[spec-id]/` | Ready to implement |
```

#### Step 6.2: Completion Message

```
✅ Spec created: [spec-id]

Files created:
  .claude/specs/[spec-id]/analysis.md   [if --full or default]
  .claude/specs/[spec-id]/plan.md

Summary:
  Steps: [N] implementation steps
  Complexity: [Simple/Standard/Complex]
  Parallel: [Yes - N streams / No]

Next steps:
  Review the plan, then run:
  /cdd:implement [spec-id]

  [If parallel supported:]
  For parallel execution:
  /cdd:implement [spec-id] --parallel
```

## Output Structure

Creates in `.claude/specs/[spec-id]/`:

```
.claude/specs/[spec-id]/
├── analysis.md    # Current state, gaps, constraints (skip if --quick)
└── plan.md        # Steps, parallel analysis, validation
```

## Examples

```bash
# Standard feature
/cdd:create "add user profile page"
# → Creates analysis + plan
# → Assesses for parallelization

# Quick plan (skip analysis)
/cdd:create "fix navigation bug" --quick
# → Creates plan only
# → Minimal exploration

# Full analysis with parallelization
/cdd:create "implement checkout flow" --full
# → Full exploration
# → Detailed analysis
# → Parallel stream identification
# → Shared contracts definition
```

## Error Handling

### CDD Not Initialized
```
❌ Context-Driven Development not set up

Run /cdd:setup first to initialize the project structure.
```

### Template Not Found
```
❌ Template not found: ${PLUGIN_ROOT}/templates/specs/plan.md.template

Plugin may be corrupted. Try reinstalling context-driven-development.
```

### Exploration Failed
```
⚠️ Codebase exploration encountered issues

[Error details]

Options:
1. Retry exploration
2. Continue with manual analysis
3. Cancel spec creation
```

## Notes

- Specs are ephemeral - delete after implementation
- Run `/cdd:learn` after implementation to capture patterns
- Analysis is optional for simple changes (use --quick)
- Parallel analysis only matters for complex features
- Always review plans before implementing
