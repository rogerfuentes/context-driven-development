import { describe, it, expect } from 'vitest';
import { parsePlanCheckboxes } from '../../src/commands/status-parser.js';

describe('parsePlanCheckboxes', () => {
  it('parses mixed checkboxes', () => {
    const content = `# Plan
- [x] Step 1: Create component
- [ ] Step 2: Add tests
- [x] Step 3: Update exports
`;
    const result = parsePlanCheckboxes(content);
    expect(result.total).toBe(3);
    expect(result.completed).toBe(2);
    expect(result.items).toHaveLength(3);
    expect(result.items[0]).toEqual({ checked: true, text: 'Step 1: Create component' });
    expect(result.items[1]).toEqual({ checked: false, text: 'Step 2: Add tests' });
  });

  it('handles all checked', () => {
    const content = '- [x] Done\n- [x] Also done\n';
    const result = parsePlanCheckboxes(content);
    expect(result.total).toBe(2);
    expect(result.completed).toBe(2);
  });

  it('handles none checked', () => {
    const content = '- [ ] Not done\n- [ ] Also not done\n';
    const result = parsePlanCheckboxes(content);
    expect(result.total).toBe(2);
    expect(result.completed).toBe(0);
  });

  it('handles empty content', () => {
    const result = parsePlanCheckboxes('');
    expect(result.total).toBe(0);
    expect(result.completed).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it('ignores non-checkbox list items', () => {
    const content = '- Regular item\n- [x] Checkbox item\n- Another regular\n';
    const result = parsePlanCheckboxes(content);
    expect(result.total).toBe(1);
    expect(result.completed).toBe(1);
  });

  it('handles uppercase X', () => {
    const content = '- [X] Done with uppercase\n';
    const result = parsePlanCheckboxes(content);
    expect(result.total).toBe(1);
    expect(result.completed).toBe(1);
  });

  it('handles indented checkboxes', () => {
    const content = '  - [x] Indented step\n    - [ ] Deeply indented\n';
    const result = parsePlanCheckboxes(content);
    expect(result.total).toBe(2);
    expect(result.completed).toBe(1);
  });

  it('handles content with no checkboxes', () => {
    const content = '# Plan\n\nSome description text\n\n## Steps\n\n1. First\n2. Second\n';
    const result = parsePlanCheckboxes(content);
    expect(result.total).toBe(0);
    expect(result.completed).toBe(0);
  });
});
