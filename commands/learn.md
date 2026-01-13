# /cdd:learn

Extract patterns from the codebase, a session, or external resources and create context files.

## Usage

```
/cdd:learn [topic]
/cdd:learn --source session
/cdd:learn --source url <url>
/cdd:learn --source prompt
```

## Arguments

- `topic` (optional): Specific topic to learn about (e.g., "authentication", "navigation")
- `--source`: Where to learn from
  - `session` (default): Analyze current conversation for patterns worth documenting
  - `url`: Fetch and extract patterns from external documentation
  - `prompt`: Interactive exploration guided by user questions

## Behavior

### Pre-flight Checks

1. Verify `.claude/` structure exists:
   ```bash
   ls .claude/context/ 2>/dev/null
   ```
   If not found, suggest running `/cdd:init` first.

2. Read current CLAUDE.md to understand existing context files.

### Mode: Session (default)

Analyze the current conversation to identify patterns worth documenting:

1. Review what was discussed/implemented in this session
2. Identify:
   - New patterns introduced
   - Conventions followed
   - Decisions made
   - Gotchas discovered

3. Propose a context file:
   ```
   I noticed we established some patterns around [topic].

   Suggested context file: context/[topic].md

   Content preview:
   ---
   [Generated content]
   ---

   Should I create this file? (Yes / Edit first / No)
   ```

### Mode: URL

Fetch external documentation and extract relevant patterns:

1. Fetch the URL content
2. Analyze for patterns applicable to this project
3. Generate a context file summarizing key points
4. Ask user to confirm before creating

Example:
```
/cdd:learn --source url https://react.dev/learn/thinking-in-react
```

### Mode: Prompt

Interactive exploration:

1. If topic provided, start there
2. Ask clarifying questions:
   - "What aspect of [topic] do you want to document?"
   - "Are there specific patterns you want to capture?"

3. Explore the codebase using the explorer agent
4. Generate context file based on findings and user input

### Context File Generation

When generating a context file, use this structure:

```markdown
# [Topic Name]

## Overview
[Brief description]

## Patterns
[Specific patterns used in this project]

## Examples
[Code examples from the actual codebase]

## Anti-patterns
[What to avoid]
```

### Updating CLAUDE.md

After creating a context file, update the Technical Context table in CLAUDE.md:

1. Read current CLAUDE.md
2. Find the Technical Context table
3. Add new row:
   ```markdown
   | `context/[filename].md` | Load when [specific scenarios] |
   ```
4. Ask user to confirm the "Load when..." description

### Using the Explorer Agent

For codebase exploration, launch the explorer agent:

```
Use the Task tool with subagent_type: "explorer" and prompt:

"Explore the codebase to understand [topic].

Find:
- Files related to [topic]
- Patterns and conventions used
- Examples of implementation
- Any inconsistencies or variations

Return structured findings that can become a context file."
```

## Output

- New file in `.claude/context/[topic].md`
- Updated CLAUDE.md with new table entry
- Summary of what was learned

## Error Handling

- If URL fetch fails, report error and suggest alternatives
- If no patterns found, explain and ask for more specific topic
- If file already exists, ask whether to merge or replace

## Examples

```
# Learn from current session
/cdd:learn

# Learn about specific topic
/cdd:learn authentication

# Learn from external docs
/cdd:learn --source url https://docs.example.com/api

# Interactive exploration
/cdd:learn --source prompt
```

## Notes

- Generated content should be reviewed by user before finalizing
- Token budget: aim for 300-500 tokens per context file
- Focus on project-specific patterns, not general knowledge
