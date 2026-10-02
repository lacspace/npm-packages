import { fetchImpl, ForexRate, ForexSnapshot, SourceOptions, UA } from "../types.js";

const BASE = "https://www.nrb.org.np/api/forex/v1/rates";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parse the NRB forex API payload into day → rates. Exported for tests/offline use. */
export function parseNrbPayload(json: any): Array<{ date: string; rates: ForexRate[] }> {
  const rows = (json?.data?.payload ?? []) as any[];
  return rows
    .map((row) => ({
      date: String(row.date ?? "").slice(0, 10),
      rates: ((row.rates ?? []) as any[]).map((r) => ({
        iso3: String(r.currency?.iso3 ?? "").toUpperCase(),
        name: String(r.currency?.name ?? ""),
        unit: Number(r.currency?.unit ?? 1),
        buy: Number(r.buy),
        sell: Number(r.sell),
      })).filter((r) => r.iso3 && Number.isFinite(r.sell)),
    }))
    .filter((d) => d.date && d.rates.length)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Attach delta vs the previous day's rates (matched by iso3, same unit). */
export function withDeltas(today: ForexRate[], previous: ForexRate[] | undefined): ForexRate[] {
  if (!previous) return today;
  const prev = new Map(previous.map((r) => [r.iso3, r]));
  return today.map((r) => {
    const p = prev.get(r.iso3);
    if (!p || p.unit !== r.unit) return r;
    const delta = round(r.sell - p.sell, 2);
    return { ...r, delta, deltaPct: p.sell ? round((delta / p.sell) * 100, 2) : undefined };
  });
}

export interface NrbOptions extends SourceOptions {
  /** AD date (YYYY-MM-DD). Default: today (UTC). */
  date?: string;
}

/**
 * Official Nepal Rastra Bank exchange rates for a day (+ delta vs the previous published day).
 * Pulls a 7-day window so weekends/holidays still yield a "previous" day.
 */
export async function nrbForex(options: NrbOptions = {}): Promise<ForexSnapshot> {
  const to = options.date ?? ymd(new Date());
  const fromD = new Date(to + "T00:00:00Z");
  fromD.setUTCDate(fromD.getUTCDate() - 7);
  const url = `${BASE}?page=1&per_page=100&from=${ymd(fromD)}&to=${to}`;
  const res = await fetchImpl(options.fetch)(url, { headers: UA, signal: options.signal });
  if (!res.ok) throw new Error(`nrb ${res.status}`);
  const days = parseNrbPayload(await res.json());
  if (!days.length) throw new Error("nrb: no rates in window");
  const last = days[days.length - 1]!;
  const prev = days.length > 1 ? days[days.length - 2] : undefined;
  return {
    kind: "forex",
    date: last.date,
    previousDate: prev?.date,
    rates: withDeltas(last.rates, prev?.rates),
    source: "Nepal Rastra Bank",
    url,
    fetchedAt: new Date().toISOString(),
  };
}

export function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
