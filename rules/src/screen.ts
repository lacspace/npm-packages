/**
 * Screener: run a rule group on the LAST candle of many symbols, with metadata filters
 * (sector, price, turnover) and ranking. Same engine as backtests and alerts, so a stock
 * that passes the screen is exactly one whose entry rules are true on that candle.
 */

import { evaluate, operandSeries, type Group, type Operand, type RBar, type Rules } from "./strategy";

export interface ScreenSymbol {
  symbol: string;
  /** Closed candles, oldest first. Pass only closed candles: the last one is evaluated. */
  bars: RBar[];
  sector?: string;
  /** Anything else you want echoed back (name, market cap, …). */
  meta?: Record<string, unknown>;
}

export interface ScreenOptions {
  /** Conditions to require, as a Group (`{ mode, conds }`) or full Rules (its `entry` is used). */
  rules?: Group | Rules;
  /** Only these sectors (case-insensitive). */
  sectors?: string[];
  minPrice?: number;
  maxPrice?: number;
  /** Minimum turnover of the last candle (close × volume), in price units. */
  minTurnover?: number;
  /**
   * Rank by an operand's value on the last candle (e.g. `{ k: "rsi", n: 14 }`), or by
   * "change" (% change over the last candle), "turnover" or "volume". Default "turnover".
   */
  rankBy?: Operand | "change" | "turnover" | "volume";
  /** "desc" (default) or "asc". */
  order?: "asc" | "desc";
  limit?: number;
}

export interface ScreenHit {
  symbol: string;
  sector?: string;
  close: number;
  changePct: number | null;
  turnover: number;
  /** The value ranked on. */
  rank: number | null;
  meta?: Record<string, unknown>;
}

export interface ScreenResult {
  hits: ScreenHit[];
  /** Symbols skipped and why (too little history, filtered out, no bars). */
  skipped: { symbol: string; reason: "no-bars" | "warming-up" | "filtered" | "rules" }[];
}

const asRules = (g: Group | Rules): Rules =>
  "entry" in g ? g : { name: "screen", entry: g, exit: { mode: "any", conds: [] } };

/** Screen many symbols on their last closed candle. */
export function screen(universe: ScreenSymbol[], o: ScreenOptions = {}): ScreenResult {
  const hits: ScreenHit[] = [];
  const skipped: ScreenResult["skipped"] = [];
  const sectors = o.sectors?.map((s) => s.toLowerCase());
  const rules = o.rules ? asRules(o.rules) : null;
  const rankBy = o.rankBy ?? "turnover";

  for (const s of universe) {
    const b = s.bars;
    const last = b[b.length - 1];
    if (!last) { skipped.push({ symbol: s.symbol, reason: "no-bars" }); continue; }
    const prev = b[b.length - 2];
    const turnover = last.close * last.volume;
    const changePct = prev && prev.close ? ((last.close - prev.close) / prev.close) * 100 : null;
    if (
      (sectors && !sectors.includes((s.sector ?? "").toLowerCase())) ||
      (o.minPrice !== undefined && last.close < o.minPrice) ||
      (o.maxPrice !== undefined && last.close > o.maxPrice) ||
      (o.minTurnover !== undefined && turnover < o.minTurnover)
    ) { skipped.push({ symbol: s.symbol, reason: "filtered" }); continue; }

    if (rules) {
      const ev = evaluate(rules, b);
      if (b.length < ev.need) { skipped.push({ symbol: s.symbol, reason: "warming-up" }); continue; }
      if (!ev.entry[b.length - 1]) { skipped.push({ symbol: s.symbol, reason: "rules" }); continue; }
    }

    let rank: number | null;
    if (rankBy === "turnover") rank = turnover;
    else if (rankBy === "volume") rank = last.volume;
    else if (rankBy === "change") rank = changePct;
    else rank = operandSeries(rankBy, b)[b.length - 1] ?? null;
    hits.push({ symbol: s.symbol, sector: s.sector, close: last.close, changePct, turnover, rank, ...(s.meta ? { meta: s.meta } : {}) });
  }

  const dir = o.order === "asc" ? 1 : -1;
  hits.sort((x, y) => (x.rank == null ? 1 : y.rank == null ? -1 : dir * (x.rank - y.rank)));
  return { hits: o.limit ? hits.slice(0, o.limit) : hits, skipped };
}
