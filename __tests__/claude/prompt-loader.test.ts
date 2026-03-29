import { describe, it, expect } from 'vitest';
import { renderPrompt } from '../../src/claude/prompt-loader.js';

describe('renderPrompt', () => {
  it('replaces a single variable', () => {
    const result = renderPrompt('Hello {{name}}!', { name: 'World' });
    expect(result).toBe('Hello World!');
  });

  it('replaces multiple variables', () => {
    const result = renderPrompt('{{greeting}} {{name}}, you are {{age}} years old.', {
      greeting: 'Hi',
      name: 'Alice',
      age: 30,
    });
    expect(result).toBe('Hi Alice, you are 30 years old.');
  });

  it('leaves unmatched placeholders as-is', () => {
    const result = renderPrompt('Hello {{name}}, your id is {{id}}', { name: 'Bob' });
    expect(result).toBe('Hello Bob, your id is {{id}}');
  });

  it('handles empty variables object', () => {
    const result = renderPrompt('Hello {{name}}!', {});
    expect(result).toBe('Hello {{name}}!');
  });

  it('handles template with no placeholders', () => {
    const result = renderPrompt('No variables here.', { name: 'ignored' });
    expect(result).toBe('No variables here.');
  });

  it('converts boolean values to strings', () => {
    const result = renderPrompt('Flag is {{flag}}', { flag: true });
    expect(result).toBe('Flag is true');
  });

  it('converts number values to strings', () => {
    const result = renderPrompt('Count: {{count}}', { count: 42 });
    expect(result).toBe('Count: 42');
  });

  it('treats undefined values as unmatched', () => {
    const result = renderPrompt('Value: {{val}}', { val: undefined });
    expect(result).toBe('Value: {{val}}');
  });

  it('replaces the same variable multiple times', () => {
    const result = renderPrompt('{{x}} and {{x}} again', { x: 'ok' });
    expect(result).toBe('ok and ok again');
  });

  it('handles adjacent placeholders', () => {
    const result = renderPrompt('{{a}}{{b}}', { a: 'hello', b: 'world' });
    expect(result).toBe('helloworld');
  });
});
