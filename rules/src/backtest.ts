/* Strategy backtester (from ShareRocketPro's chart). Signals are read on a bar's close and
   filled at the NEXT bar's open; stops/targets are checked against each later bar's high/low
   (if both could have hit in one bar, the stop is assumed first); costs are charged on both
   sides; an open position is closed at the last close with reason "end". */

import { describeRules, evaluate, type RBar, type Rules } from "./strategy";

type Bar = RBar;
type Series = (number | null)[];

/** Anything that turns bars into per-bar signals: +1 = go long, −1 = exit (or short), 0 = nothing. */
export interface StrategyDef {
  id: string;
  name: string;
  blurb: string;
  params: { key: string; label: string; def: number; min: number; max: number; step?: number }[];
  signals: (bars: Bar[], p: Record<string, number>) => { entry: (1 | -1 | 0)[]; need: number; atr?: Series };
}

/** A user's own rules as a strategy: +1 on the entry conditions, −1 on the exit conditions. */
export function rulesStrategy(r: Rules): StrategyDef {
  return {
    id: "custom",
    name: r.name,
    blurb: describeRules(r),
    params: [],
    signals: (bars) => {
      const ev = evaluate(r, bars);
      return { entry: bars.map((_, i) => (ev.entry[i] ? 1 : ev.exit[i] ? -1 : 0)), need: ev.need, atr: ev.atr };
    },
  };
}

export interface BtOptions {
  direction: "long" | "both";
  capital: number;
  /** Per side, % of trade value (NEPSE broker commission + SEBON fee + DP charges ~0.4%). */
  costPct: number;
  stopPct: number; // 0 = off
  targetPct: number; // 0 = off
  /** Stop / target as multiples of ATR(14) on the signal candle (custom rules; 0 = off). Used instead of the % ones when set. */
  stopAtr?: number;
  targetAtr?: number;
}

export interface BtTrade {
  side: "long" | "short";
  entryI: number;
  exitI: number;
  entryT: number;
  exitT: number;
  entry: number;
  exit: number;
  qty: number;
  pnl: number;
  pnlPct: number;
  reason: "signal" | "stop" | "target" | "end";
}

export interface BtResult {
  trades: BtTrade[];
  equity: { time: number; value: number }[];
  start: number;
  end: number;
  netPct: number;
  netPnl: number;
  winRate: number;
  profitFactor: number | null;
  maxDdPct: number;
  avgPct: number;
  buyHoldPct: number;
  exposurePct: number;
  bars: number;
  need: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function runBacktest(bars: Bar[], strat: StrategyDef, params: Record<string, number>, o: BtOptions): BtResult {
  const { entry, need, atr: atrS } = strat.signals(bars, params);
  const cost = Math.max(0, o.costPct) / 100;
  let cash = o.capital;
  type Pos = { side: "long" | "short"; qty: number; entry: number; entryI: number; stop: number | null; target: number | null };
  const st: { pos: Pos | null } = { pos: null };
  const trades: BtTrade[] = [];
  const equity: { time: number; value: number }[] = [];
  let inBars = 0;

  const close = (i: number, price: number, reason: BtTrade["reason"]) => {
    if (!st.pos) return;
    const gross = st.pos.side === "long" ? (price - st.pos.entry) * st.pos.qty : (st.pos.entry - price) * st.pos.qty;
    const fees = (st.pos.entry * st.pos.qty + price * st.pos.qty) * cost;
    const pnl = gross - fees;
    // Long: sell the shares. Short: settle the price difference (the entry fee was paid on open).
    cash += st.pos.side === "long" ? price * st.pos.qty * (1 - cost) : (st.pos.entry - price) * st.pos.qty - price * st.pos.qty * cost;
    trades.push({
      side: st.pos.side,
      entryI: st.pos.entryI,
      exitI: i,
      entryT: bars[st.pos.entryI].time,
      exitT: bars[i].time,
      entry: r2(st.pos.entry),
      exit: r2(price),
      qty: st.pos.qty,
      pnl: r2(pnl),
      pnlPct: r2((pnl / (st.pos.entry * st.pos.qty)) * 100),
      reason,
    });
    st.pos = null;
  };

  /** Stop / target distance for a fill at bar i: ATR multiples of the signal candle's ATR, else %. */
  const level = (i: number, side: "long" | "short", price: number, atrK: number | undefined, pctK: number) => {
    const dir = side === "long" ? 1 : -1;
    const a = atrS?.[i - 1];
    if (atrK && a != null) return price - dir * atrK * a;
    return pctK > 0 ? price * (1 - (dir * pctK) / 100) : null;
  };
  const open = (i: number, side: "long" | "short", price: number) => {
    const qty = Math.floor((cash * (1 - cost)) / price);
    if (qty < 1) return;
    if (side === "long") cash -= price * qty * (1 + cost);
    else cash -= price * qty * cost; // short: only the fee leaves cash now; P&L settles on close
    st.pos = {
      side,
      qty,
      entry: price,
      entryI: i,
      stop: level(i, side, price, o.stopAtr, o.stopPct),
      target: (() => {
        const t = level(i, side, price, o.targetAtr, o.targetPct);
        // level() measures a stop (against the trade); a target sits on the other side.
        return t == null ? null : 2 * price - t;
      })(),
    };
  };

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    // 1) fills from the previous bar's signal, at this bar's open
    if (i > 0 && i - 1 >= need - 1) {
      const sig = entry[i - 1];
      if (sig === 1) {
        if (st.pos?.side === "short") close(i, b.open, "signal");
        if (!st.pos) open(i, "long", b.open);
      } else if (sig === -1) {
        if (st.pos?.side === "long") close(i, b.open, "signal");
        if (!st.pos && o.direction === "both") open(i, "short", b.open);
      }
    }
    // 2) stop / target inside this bar (stop first when both could hit)
    if (st.pos) {
      const p = st.pos as Pos;
      if (p.side === "long") {
        if (p.stop != null && b.low <= p.stop) close(i, Math.min(b.open, p.stop), "stop");
        else if (p.target != null && b.high >= p.target) close(i, Math.max(b.open, p.target), "target");
      } else {
        if (p.stop != null && b.high >= p.stop) close(i, Math.max(b.open, p.stop), "stop");
        else if (p.target != null && b.low <= p.target) close(i, Math.min(b.open, p.target), "target");
      }
    }
    if (st.pos) inBars++;
    const p2 = st.pos as Pos | null;
    const mark = p2 ? (p2.side === "long" ? cash + b.close * p2.qty : cash + (p2.entry - b.close) * p2.qty) : cash;
    equity.push({ time: b.time, value: r2(mark) });
  }
  if (st.pos && bars.length) close(bars.length - 1, bars[bars.length - 1].close, "end");
  const endValue = cash;
  if (equity.length) equity[equity.length - 1] = { time: equity[equity.length - 1].time, value: r2(endValue) };

  let peak = -Infinity;
  let maxDd = 0;
  for (const e of equity) {
    peak = Math.max(peak, e.value);
    if (peak > 0) maxDd = Math.max(maxDd, ((peak - e.value) / peak) * 100);
  }
  const wins = trades.filter((t) => t.pnl > 0);
  const grossWin = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = trades.filter((t) => t.pnl <= 0).reduce((a, t) => a - t.pnl, 0);
  const first = bars.find((_, i) => i >= need) || bars[0];
  const last = bars[bars.length - 1];
  return {
    trades,
    equity,
    start: o.capital,
    end: r2(endValue),
    netPnl: r2(endValue - o.capital),
    netPct: r2(((endValue - o.capital) / o.capital) * 100),
    winRate: trades.length ? r2((wins.length / trades.length) * 100) : 0,
    profitFactor: grossLoss > 0 ? r2(grossWin / grossLoss) : grossWin > 0 ? null : 0,
    maxDdPct: r2(maxDd),
    avgPct: trades.length ? r2(trades.reduce((a, t) => a + t.pnlPct, 0) / trades.length) : 0,
    buyHoldPct: first && last ? r2(((last.close - first.open) / first.open) * 100) : 0,
    exposurePct: bars.length ? r2((inBars / bars.length) * 100) : 0,
    bars: bars.length,
    need,
  };
}

/**
 * Backtest a rule set with ShareRocketPro's semantics. Long only by default; the rules'
 * `stopAtr` / `targetAtr` are applied unless overridden in `o`.
 */
export function backtestRules(bars: Bar[], r: Rules, o: Partial<BtOptions> = {}): BtResult {
  return runBacktest(bars, rulesStrategy(r), {}, {
    direction: "long",
    capital: 100000,
    costPct: 0.4,
    stopPct: 0,
    targetPct: 0,
    stopAtr: r.stopAtr,
    targetAtr: r.targetAtr,
    ...o,
  });
}
