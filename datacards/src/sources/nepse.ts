import { NepseMover, NepseSnapshot } from "../types.js";

/**
 * NEPSE's official endpoints (nepalstock.com.np) require a session token, so this package does
 * not fetch them. Feed whatever official JSON you obtained (index + optional gainers/losers) and
 * get a normalised snapshot. Accepts the common shapes: nepse-index array, market-summary rows,
 * or an already-flat object.
 */
export function nepseFromJson(input: { index?: any; gainers?: any[]; losers?: any[]; date?: string; url?: string }): NepseSnapshot {
  const idx = normaliseIndex(input.index);
  const movers = (rows?: any[]): NepseMover[] | undefined =>
    rows?.length
      ? rows.map((r) => ({
          symbol: String(r.symbol ?? r.stockSymbol ?? r.securitySymbol ?? ""),
          name: r.securityName ?? r.name ?? undefined,
          ltp: Number(r.ltp ?? r.lastTradedPrice ?? r.closePrice ?? 0),
          changePct: Number(r.percentageChange ?? r.pointChange ?? r.changePct ?? 0),
        })).filter((m) => m.symbol)
      : undefined;
  return {
    kind: "nepse",
    date: input.date ?? idx.date ?? new Date().toISOString().slice(0, 10),
    index: idx.index, change: idx.change, changePct: idx.changePct, turnover: idx.turnover, volume: idx.volume,
    gainers: movers(input.gainers), losers: movers(input.losers),
    source: "Nepal Stock Exchange", url: input.url ?? "https://www.nepalstock.com.np/", fetchedAt: new Date().toISOString(),
  };
}

function normaliseIndex(raw: any): { index: number; change: number; changePct: number; turnover?: number; volume?: number; date?: string } {
  let row = raw;
  if (Array.isArray(raw)) row = raw.find((r) => /^nepse(\s+index)?$/i.test(String(r.index ?? r.indexName ?? r.name ?? ""))) ?? raw[0];
  if (!row) throw new Error("nepse: no index row");
  const num = (...keys: string[]) => {
    for (const k of keys) if (row[k] != null && Number.isFinite(Number(row[k]))) return Number(row[k]);
    return undefined;
  };
  const index = num("currentValue", "close", "index", "value") ?? 0;
  const change = num("change", "pointChange", "absoluteChange") ?? 0;
  const changePct = num("perChange", "percentageChange", "changePct") ?? (index && change ? Math.round((change / (index - change)) * 10000) / 100 : 0);
  return { index, change, changePct, turnover: num("turnover", "totalTurnover"), volume: num("volume", "totalTradedShares"), date: row.businessDate ?? row.date ?? undefined };
}
