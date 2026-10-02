/**
 * TextRank sentence scoring: build a similarity graph between sentences and run
 * PageRank over it. Similarity is shared-token count normalized by sentence lengths
 * (the classic Mihalcea–Tarau measure). Deterministic.
 */
export function textrank(tokenSets: string[][], opts: { damping?: number; iterations?: number } = {}): number[] {
  const n = tokenSets.length;
  if (n === 0) return [];
  if (n === 1) return [1];
  const d = opts.damping ?? 0.85;
  const iters = opts.iterations ?? 40;

  const sets = tokenSets.map((t) => new Set(t));
  const sim: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const rowSum = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const li = sets[i]!.size;
      const lj = sets[j]!.size;
      if (li < 1 || lj < 1) continue;
      let common = 0;
      for (const w of sets[i]!) if (sets[j]!.has(w)) common++;
      const denom = Math.log(li + 1) + Math.log(lj + 1);
      const w = denom > 0 ? common / denom : 0;
      sim[i]![j] = w;
      sim[j]![i] = w;
    }
  }
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let j = 0; j < n; j++) r += sim[i]![j]!;
    rowSum[i] = r;
  }

  let score = new Array(n).fill(1 / n);
  for (let it = 0; it < iters; it++) {
    const next = new Array(n).fill((1 - d) / n);
    for (let i = 0; i < n; i++) {
      let acc = 0;
      for (let j = 0; j < n; j++) {
        if (j === i || rowSum[j] === 0) continue;
        acc += (sim[j]![i]! / rowSum[j]!) * score[j]!;
      }
      next[i] += d * acc;
    }
    score = next;
  }
  // Normalize to a 0..1 range for readability.
  const max = Math.max(...score, 1e-9);
  return score.map((s) => s / max);
}
