// A small, dependency-free Thompson-sampling bandit for learning the best option per
// platform — posting time, format (video/image/carousel/text), thumbnail or title
// variant. Each arm keeps a Beta(α, β) posterior; choose() samples each arm and picks
// the max; update() folds in a reward in [0, 1] (e.g. a normalized engagement rate).
// Deterministic when seeded, so it is fully testable.

const VERSION = "1.0.0";

export interface ArmState {
  id: string;
  alpha: number;
  beta: number;
  pulls: number;
}

export interface ArmStat extends ArmState {
  /** Posterior mean α/(α+β) — the current best estimate of the arm's reward. */
  mean: number;
}

/** Deterministic PRNG (mulberry32) so seeded bandits are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box–Muller using the supplied uniform RNG. */
function randNormal(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Gamma(shape, 1) via Marsaglia–Tsang. */
function randGamma(shape: number, rng: () => number): number {
  if (shape < 1) {
    const u = rng();
    return randGamma(1 + shape, rng) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x = randNormal(rng);
    let v = 1 + c * x;
    if (v <= 0) continue;
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function sampleBeta(alpha: number, beta: number, rng: () => number): number {
  const x = randGamma(alpha, rng);
  const y = randGamma(beta, rng);
  return x / (x + y);
}

export interface BanditOptions {
  priorAlpha?: number;
  priorBeta?: number;
  /** Seed for reproducible sampling. Omit for Math.random-based exploration. */
  seed?: number;
}

export class Bandit {
  private arms = new Map<string, ArmState>();
  private rng: () => number;
  private priorAlpha: number;
  private priorBeta: number;

  constructor(ids: string[] = [], options: BanditOptions = {}) {
    this.priorAlpha = options.priorAlpha ?? 1;
    this.priorBeta = options.priorBeta ?? 1;
    this.rng = options.seed !== undefined ? mulberry32(options.seed) : Math.random;
    for (const id of ids) this.addArm(id);
  }

  addArm(id: string): void {
    if (!this.arms.has(id)) this.arms.set(id, { id, alpha: this.priorAlpha, beta: this.priorBeta, pulls: 0 });
  }

  /** Thompson sample: draw θ from each arm's posterior and return the arm with the max. */
  choose(): string {
    let best = "";
    let bestTheta = -1;
    for (const a of this.arms.values()) {
      const theta = sampleBeta(a.alpha, a.beta, this.rng);
      if (theta > bestTheta) {
        bestTheta = theta;
        best = a.id;
      }
    }
    return best;
  }

  /** Rank all arms by a single Thompson draw each (for choosing an ordered lineup). */
  rank(): string[] {
    return [...this.arms.values()]
      .map((a) => ({ id: a.id, theta: sampleBeta(a.alpha, a.beta, this.rng) }))
      .sort((x, y) => y.theta - x.theta)
      .map((x) => x.id);
  }

  /** Record an outcome. `reward` is in [0,1]; booleans map to 1/0. */
  update(id: string, reward: number | boolean): void {
    this.addArm(id);
    const a = this.arms.get(id)!;
    const r = Math.max(0, Math.min(1, typeof reward === "boolean" ? (reward ? 1 : 0) : reward));
    a.alpha += r;
    a.beta += 1 - r;
    a.pulls += 1;
  }

  stats(): ArmStat[] {
    return [...this.arms.values()]
      .map((a) => ({ ...a, mean: a.alpha / (a.alpha + a.beta) }))
      .sort((x, y) => y.mean - x.mean);
  }

  /** The arm with the highest posterior mean (exploit). */
  best(): string | undefined {
    return this.stats()[0]?.id;
  }

  toJSON(): ArmState[] {
    return [...this.arms.values()].map((a) => ({ ...a }));
  }

  static fromJSON(state: ArmState[], options: BanditOptions = {}): Bandit {
    const b = new Bandit([], options);
    for (const s of state) b.arms.set(s.id, { ...s });
    return b;
  }
}

/** Convenience factory. */
export function createBandit(ids: string[] = [], options: BanditOptions = {}): Bandit {
  return new Bandit(ids, options);
}

/** Machine-readable descriptor for an AI "conductor". */
export function describe() {
  return {
    name: "@lacspace/postbandit",
    version: VERSION,
    summary: "Thompson-sampling bandit to learn the best posting time / format / thumbnail / title variant per platform. Plugs into @lacspace/postplan.",
    commands: [
      { name: "choose", input: { type: "object", properties: {}, description: "returns the arm id to try next" }, output: "string (arm id)" },
      { name: "rank", input: { type: "object", properties: {} }, output: "string[] (arm ids, best first)" },
      { name: "update", input: { type: "object", properties: { id: { type: "string" }, reward: { type: "number", minimum: 0, maximum: 1 } }, required: ["id", "reward"] }, output: "void" },
      { name: "stats", input: { type: "object", properties: {} }, output: "{ id, alpha, beta, pulls, mean }[]" },
    ],
  };
}
