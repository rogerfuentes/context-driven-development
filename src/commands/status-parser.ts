export interface PlanCheckboxes {
  total: number;
  completed: number;
  items: Array<{ text: string; checked: boolean }>;
}

export function parsePlanCheckboxes(planContent: string): PlanCheckboxes {
  const items: Array<{ text: string; checked: boolean }> = [];
  // Match lines like "- [x] Some step" or "- [ ] Some step"
  const regex = /^[\s]*-\s+\[([ xX])\]\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(planContent)) !== null) {
    items.push({
      checked: match[1].toLowerCase() === 'x',
      text: match[2].trim(),
    });
  }
  return {
    total: items.length,
    completed: items.filter(i => i.checked).length,
    items,
  };
}
