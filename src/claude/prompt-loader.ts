export type PromptVariables = Record<string, string | number | boolean | undefined>;

/**
 * Replace `{{key}}` placeholders in a template with variable values.
 * Unmatched placeholders are left as-is.
 */
export function renderPrompt(template: string, variables: PromptVariables): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = variables[key];
    return value !== undefined ? String(value) : match;
  });
}
