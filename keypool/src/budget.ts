/**
 * Daily budgets with priority lanes on a shared quota pool. @since 1.4.0
 *
 * A "family" is one daily quota pool, e.g. Gemini TTS: 4 models × 5 projects × 10 requests a day.
 * A "lane" is a purpose with a priority and an optional reserve:
 *
 *   lanes: { pulse: { priority: 1, reserve: 40 }, video: { priority: 3 } }
 *
 * `acquire("video")` refuses (reason "reserved") once the only budget left is what higher-priority
 * lanes still have reserved, so video falls back to its free alternative instead of eating Pulse's
 * calls or burning a 429. Usage resets at the family's quota reset (Gemini: midnight Pacific). The
 * per-pair daily limit can be learned from the provider's 429 body.
 */
import type { ChainStore } from "./chain.js";

export type Reset = "pacific" | "utc" | "npt" | ((now: number) => string);

export interface FamilyDef {
  /** Which calls draw on this pool. */
  match?: { provider?: string; models?: (string | RegExp)[] };
  /** Total requests per day for the whole pool (wins over limitPerPair × pairs). */
  limit?: number;
  /** Requests per day per key+model pair (learned from 429 bodies when absent). */
  limitPerPair?: number;
  /** Number of key+model pairs in the pool (a number, or a loader e.g. keys × models). */
  pairs?: number | (() => number | Promise<number>);
  /** When the provider resets the daily quota (default "pacific", Google's reset). */
  reset?: Reset;
}
export interface LaneDef {
  /** 1 = most important. Lanes only yield to lanes with a smaller number. */
  priority: number;
  /** Calls per day kept back for this lane from every less important lane. */
  reserve?: number;
  /** Optional hard cap per day for this lane. */
  cap?: number;
  /** The family this lane draws on (default: the only family, or the call's family). */
  family?: string;
}
export interface BudgetOptions {
  store: ChainStore;
  families: Record<string, FamilyDef>;
  lanes?: Record<string, LaneDef>;
  /** Lane for purposes not listed (default priority 5, no reserve). */
  defaultLane?: LaneDef;
  now?: () => number;
}
export type AcquireResult =
  | { ok: true; family: string; remaining: number }
  | { ok: false; family: string; reason: "reserved" | "exhausted" | "lane-cap" | "unknown-family"; remaining: number };
export interface Remaining {
  family: string;
  day: string;
  capacity: number | null;
  used: number;
  /** Still reserved for more important lanes. */
  heldForHigher: number;
  /** What this purpose can still take today (Infinity when the capacity is unknown). */
  available: number;
  lane: { name: string; priority: number; used: number; reserve: number; cap?: number };
}
export interface Budget {
  acquire(purpose: string, family?: string): Promise<AcquireResult>;
  /** Give back a call that never reached the provider (e.g. the caller aborted). */
  refund(purpose: string, family?: string): Promise<void>;
  remaining(purpose: string, family?: string): Promise<Remaining>;
  /** Every family × lane, for a dashboard. */
  snapshot(): Promise<Remaining[]>;
  /** Read a per-day limit from a provider 429 body; returns the limit it learned, if any. */
  learn(family: string, errorText: string): Promise<number | null>;
  /** Mark the pool used up for today (every pair answered "per day" 429). */
  exhaust(family: string): Promise<void>;
  /** The family a provider/model call draws on, if any. */
  familyOf(provider: string, model: string): string | undefined;
}

const DAY_MS = 86_400_000;
function zoneDate(now: number, tz: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export function dayOf(reset: Reset | undefined, now: number): string {
  if (typeof reset === "function") return reset(now);
  if (reset === "utc") return new Date(now).toISOString().slice(0, 10);
  if (reset === "npt") return new Date(now + 5.75 * 3600_000).toISOString().slice(0, 10);
  return zoneDate(now, "America/Los_Angeles");
}
/** Per-day limit in a provider error: Gemini "limit: 10" / "quotaValue": "10"; Groq "Limit 14400". */
export function dailyLimitFrom(text: string): number | null {
  if (!/per[ _]?day|PerDay|\bRPD\b|\bTPD\b|daily/i.test(text)) return null;
  const m = /"quotaValue"\s*:\s*"?(\d+)/.exec(text) ?? /\blimit:\s*(\d+)/i.exec(text) ?? /\bLimit\s+(\d+)/.exec(text);
  return m ? Number(m[1]) : null;
}

export function createBudget(options: BudgetOptions): Budget {
  const { store, families } = options;
  const now = options.now ?? Date.now;
  const lanes = options.lanes ?? {};
  const laneOf = (p: string): LaneDef => lanes[p] ?? options.defaultLane ?? { priority: 5 };
  const famFor = (p: string, f?: string): string | undefined => f ?? laneOf(p).family ?? (Object.keys(families).length === 1 ? Object.keys(families)[0] : undefined);
  const k = (fam: string, day: string, what: string) => `ai:bud:${fam}:${day}:${what}`;
  const num = async (key: string) => Number((await store.get(key)) ?? 0);
  const ttl = 2 * DAY_MS;

  const capacity = async (fam: string): Promise<number | null> => {
    const def = families[fam]!;
    if (def.limit != null) return def.limit;
    const per = def.limitPerPair ?? (Number((await store.get(`ai:bud:lim:${fam}`)) ?? 0) || null);
    if (per == null) return null;
    const pairs = typeof def.pairs === "function" ? await def.pairs() : def.pairs ?? 1;
    return per * pairs;
  };
  const used = async (fam: string, day: string) => (await num(k(fam, day, "used"))) - (await num(k(fam, day, "refund")));
  const laneUsed = async (fam: string, day: string, lane: string) => (await num(k(fam, day, `lane:${lane}`))) - (await num(k(fam, day, `lane:${lane}:refund`)));

  const state = async (purpose: string, fam: string): Promise<Remaining> => {
    const day = dayOf(families[fam]!.reset, now());
    const lane = laneOf(purpose);
    const cap = await capacity(fam);
    const exhausted = !!(await store.get(k(fam, day, "exhausted")));
    const u = await used(fam, day);
    let held = 0;
    for (const [name, def] of Object.entries(lanes)) {
      if (def.priority >= lane.priority || !def.reserve || (def.family ?? fam) !== fam) continue;
      held += Math.max(0, def.reserve - (await laneUsed(fam, day, name)));
    }
    const lu = await laneUsed(fam, day, purpose);
    const free = exhausted ? 0 : cap == null ? Infinity : Math.max(0, cap - u);
    let available = Math.max(0, free - held);
    if (lane.cap != null) available = Math.min(available, Math.max(0, lane.cap - lu));
    return { family: fam, day, capacity: exhausted ? Math.min(cap ?? u, u) : cap, used: u, heldForHigher: held, available, lane: { name: purpose, priority: lane.priority, used: lu, reserve: lane.reserve ?? 0, cap: lane.cap } };
  };

  return {
    async acquire(purpose, family) {
      const fam = famFor(purpose, family);
      if (!fam || !families[fam]) return { ok: false, family: fam ?? "", reason: "unknown-family", remaining: 0 };
      const s = await state(purpose, fam);
      if (s.available <= 0) {
        const lane = laneOf(purpose);
        const reason = lane.cap != null && s.lane.used >= lane.cap ? "lane-cap" : s.heldForHigher > 0 && (s.capacity == null || s.used < s.capacity) ? "reserved" : "exhausted";
        return { ok: false, family: fam, reason, remaining: 0 };
      }
      await store.incr(k(fam, s.day, "used"), ttl);
      await store.incr(k(fam, s.day, `lane:${purpose}`), ttl);
      return { ok: true, family: fam, remaining: s.available === Infinity ? Infinity : s.available - 1 };
    },
    async refund(purpose, family) {
      const fam = famFor(purpose, family);
      if (!fam || !families[fam]) return;
      const day = dayOf(families[fam]!.reset, now());
      await store.incr(k(fam, day, "refund"), ttl);
      await store.incr(k(fam, day, `lane:${purpose}:refund`), ttl);
    },
    async remaining(purpose, family) {
      const fam = famFor(purpose, family);
      if (!fam || !families[fam]) throw new Error(`keypool budget: no family for purpose "${purpose}"`);
      return state(purpose, fam);
    },
    async snapshot() {
      const out: Remaining[] = [];
      for (const fam of Object.keys(families)) {
        const names = Object.entries(lanes).filter(([, d]) => (d.family ?? fam) === fam).map(([n]) => n);
        for (const n of names.length ? names : ["*"]) out.push(await state(n, fam));
      }
      return out;
    },
    async learn(family, text) {
      if (!families[family]) return null;
      const lim = dailyLimitFrom(text);
      if (lim && lim > 0) await store.set(`ai:bud:lim:${family}`, String(lim));
      return lim;
    },
    async exhaust(family) {
      if (!families[family]) return;
      const day = dayOf(families[family]!.reset, now());
      await store.set(k(family, day, "exhausted"), "1", ttl);
    },
    familyOf(provider, model) {
      for (const [name, def] of Object.entries(families)) {
        const m = def.match;
        if (!m) continue;
        if (m.provider && m.provider !== provider) continue;
        if (m.models && !m.models.some((x) => (typeof x === "string" ? x === model : x.test(model)))) continue;
        return name;
      }
      return undefined;
    },
  };
}
