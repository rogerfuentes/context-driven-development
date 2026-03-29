import { describe, it, expect } from 'vitest';
import { parseParallelAnalysis } from '../../src/commands/plan-parser.js';

const WELL_FORMED_PLAN = `
# Plan: Add User Auth

## Steps
- [x] Step 1: Setup project
- [ ] Step 2: Create auth API
- [ ] Step 3: Create auth middleware
- [ ] Step 4: Create auth UI
- [ ] Step 5: Create auth guard

## Parallel Analysis

### Can parallelize?
Yes

### Parallel Streams
| Stream | Steps | Files | Dependencies |
|--------|-------|-------|--------------|
| auth-api | 2, 3 | src/auth/client.ts, src/auth/middleware.ts | none |
| auth-ui | 4, 5 | src/components/AuthForm.tsx, src/components/AuthGuard.tsx | Stream: auth-api |
| auth-tests | 6 | __tests__/auth.test.ts | Stream: auth-api, Stream: auth-ui |

### Shared Contracts Required
\`\`\`typescript
interface AuthUser {
  id: string;
  email: string;
}
\`\`\`

### Execution Order
1. **Parallel:** auth-api
2. **Parallel:** auth-ui (after auth-api)
3. **Sequential:** auth-tests (after all)
`;

describe('parseParallelAnalysis', () => {
  it('parses a well-formed parallel analysis section', () => {
    const result = parseParallelAnalysis(WELL_FORMED_PLAN);
    expect(result.canParallelize).toBe(true);
    expect(result.streams).toHaveLength(3);

    expect(result.streams[0].name).toBe('auth-api');
    expect(result.streams[0].steps).toEqual(['2', '3']);
    expect(result.streams[0].files).toEqual(['src/auth/client.ts', 'src/auth/middleware.ts']);
    expect(result.streams[0].dependencies).toEqual([]);

    expect(result.streams[1].name).toBe('auth-ui');
    expect(result.streams[1].dependencies).toEqual(['auth-api']);

    expect(result.streams[2].name).toBe('auth-tests');
    expect(result.streams[2].dependencies).toEqual(['auth-api', 'auth-ui']);
  });

  it('parses shared contracts', () => {
    const result = parseParallelAnalysis(WELL_FORMED_PLAN);
    expect(result.sharedContracts).toHaveLength(1);
    expect(result.sharedContracts[0]).toContain('interface AuthUser');
  });

  it('parses execution order', () => {
    const result = parseParallelAnalysis(WELL_FORMED_PLAN);
    expect(result.executionOrder).toHaveLength(3);
    expect(result.executionOrder[0]).toContain('auth-api');
  });

  it('returns canParallelize false when answer is No', () => {
    const content = `## Parallel Analysis\n\n### Can parallelize?\nNo\n`;
    const result = parseParallelAnalysis(content);
    expect(result.canParallelize).toBe(false);
    expect(result.streams).toEqual([]);
  });

  it('returns canParallelize false when section is missing', () => {
    const content = `# Plan\n\n## Steps\n- [ ] Step 1\n`;
    const result = parseParallelAnalysis(content);
    expect(result.canParallelize).toBe(false);
  });

  it('handles missing shared contracts section', () => {
    const content = `### Can parallelize?\nYes\n\n### Parallel Streams\n| Stream | Steps | Files | Dependencies |\n|--------|-------|-------|------|\n| a | 1 | f.ts | none |\n`;
    const result = parseParallelAnalysis(content);
    expect(result.canParallelize).toBe(true);
    expect(result.streams).toHaveLength(1);
    expect(result.sharedContracts).toEqual([]);
  });

  it('handles missing execution order section', () => {
    const content = `### Can parallelize?\nYes\n\n### Parallel Streams\n| Stream | Steps | Files | Dependencies |\n|--------|-------|-------|------|\n| a | 1 | f.ts | none |\n`;
    const result = parseParallelAnalysis(content);
    expect(result.executionOrder).toEqual([]);
  });

  it('handles dependency format "X" without "Stream:" prefix', () => {
    const content = `### Can parallelize?\nYes\n\n### Parallel Streams\n| Stream | Steps | Files | Dependencies |\n|--------|-------|-------|------|\n| a | 1 | f.ts | none |\n| b | 2 | g.ts | a |\n`;
    const result = parseParallelAnalysis(content);
    expect(result.streams[1].dependencies).toEqual(['a']);
  });

  it('handles empty content gracefully', () => {
    const result = parseParallelAnalysis('');
    expect(result.canParallelize).toBe(false);
    expect(result.streams).toEqual([]);
    expect(result.sharedContracts).toEqual([]);
    expect(result.executionOrder).toEqual([]);
  });

  it('handles multiple shared contract blocks', () => {
    const content = `### Can parallelize?\nYes\n\n### Parallel Streams\n| Stream | Steps | Files | Dependencies |\n|--------|-------|-------|------|\n| a | 1 | f.ts | none |\n\n### Shared Contracts Required\n\`\`\`typescript\ninterface A {}\n\`\`\`\n\n\`\`\`typescript\ninterface B {}\n\`\`\`\n`;
    const result = parseParallelAnalysis(content);
    expect(result.sharedContracts).toHaveLength(2);
  });

  it('handles files with glob patterns', () => {
    const content = `### Can parallelize?\nYes\n\n### Parallel Streams\n| Stream | Steps | Files | Dependencies |\n|--------|-------|-------|------|\n| a | 1, 2 | src/auth/*.ts, src/types/*.ts | none |\n`;
    const result = parseParallelAnalysis(content);
    expect(result.streams[0].files).toEqual(['src/auth/*.ts', 'src/types/*.ts']);
  });
});
