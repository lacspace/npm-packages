/** Small text helpers for what the model reads. */

export function clip(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars) + `\n\n[truncated: showing ${maxChars} of ${text.length} characters]`, truncated: true };
}

export function lines(items: Array<[string, unknown]>): string {
  return items
    .filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
    .join("\n");
}

export function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/** Collapse runs of blank lines and trailing spaces. */
export function tidy(text: string): string {
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
