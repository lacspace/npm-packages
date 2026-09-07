/**
 * A tiny, dependency-free line diff for snapshot mismatch messages.
 * Uses an LCS to align the two line arrays, then prints `-` (expected) and
 * `+` (received) markers, jest-style.
 */
export function lineDiff(expected: string, received: string): string {
  const a = expected.split("\n");
  const b = received.split("\n");

  // LCS length table.
  const m = a.length;
  const n = b.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      const row = lcs[i]!;
      const next = lcs[i + 1]!;
      row[j] = a[i] === b[j] ? (next[j + 1]! + 1) : Math.max(next[j]!, row[j + 1]!);
    }
  }

  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push(`  ${a[i]}`);
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push(`- ${a[i]}`);
      i++;
    } else {
      out.push(`+ ${b[j]}`);
      j++;
    }
  }
  while (i < m) out.push(`- ${a[i++]}`);
  while (j < n) out.push(`+ ${b[j++]}`);

  return out.join("\n");
}

/** Build a full mismatch message with a `- Expected` / `+ Received` legend. */
export function mismatchMessage(label: string, expected: string, received: string): string {
  return (
    `${label}\n\n` +
    `- Expected\n` +
    `+ Received\n\n` +
    lineDiff(expected, received)
  );
}
