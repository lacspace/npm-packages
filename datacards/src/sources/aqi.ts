import { AqiCategory, AqiReading, AqiSnapshot, fetchImpl, SourceOptions, UA } from "../types.js";

const BASE = "https://pollution.gov.np/gss/api";

/** US EPA PM2.5 breakpoints (2024 revision) — the same scale Nepal's NAQI uses for PM2.5. */
const PM25: Array<[number, number, number, number]> = [
  [0, 9, 0, 50], [9.1, 35.4, 51, 100], [35.5, 55.4, 101, 150], [55.5, 125.4, 151, 200], [125.5, 225.4, 201, 300], [225.5, 500.4, 301, 500],
];
const PM10: Array<[number, number, number, number]> = [
  [0, 54, 0, 50], [55, 154, 51, 100], [155, 254, 101, 150], [255, 354, 151, 200], [355, 424, 201, 300], [425, 604, 301, 500],
];

export function aqiFrom(value: number, parameter: "pm25" | "pm10" = "pm25"): number {
  const table = parameter === "pm10" ? PM10 : PM25;
  const v = Math.max(0, value);
  for (const [cl, ch, il, ih] of table) {
    if (v <= ch) return Math.round(((ih - il) / (ch - cl)) * (v - cl) + il);
  }
  return 500;
}

export function aqiCategory(aqi: number): AqiCategory {
  if (aqi <= 50) return "good";
  if (aqi <= 100) return "moderate";
  if (aqi <= 150) return "unhealthy-sensitive";
  if (aqi <= 200) return "unhealthy";
  if (aqi <= 300) return "very-unhealthy";
  return "hazardous";
}

export const AQI_LABELS: Record<AqiCategory, { en: string; ne: string; color: string }> = {
  good: { en: "Good", ne: "राम्रो", color: "#00e400" },
  moderate: { en: "Moderate", ne: "मध्यम", color: "#ffff00" },
  "unhealthy-sensitive": { en: "Unhealthy for sensitive groups", ne: "संवेदनशील समूहका लागि अस्वस्थकर", color: "#ff7e00" },
  unhealthy: { en: "Unhealthy", ne: "अस्वस्थकर", color: "#ff0000" },
  "very-unhealthy": { en: "Very unhealthy", ne: "अति अस्वस्थकर", color: "#8f3f97" },
  hazardous: { en: "Hazardous", ne: "खतरनाक", color: "#7e0023" },
};

/**
 * Pick the best PM2.5 (or PM10) series from a DoEnv `/station/{id}/data-series` list.
 * Prefers the 1-hour mean, then instantaneous (which is what the official portal's AQI map uses).
 */
export function pickSeries(series: any[], parameter: "pm25" | "pm10" = "pm25"): { id: number; code: string } | undefined {
  return rankSeries(series, parameter)[0];
}

/** All matching series, best first (1-h mean → instantaneous → 24-h → others). Aggregates are skipped. */
export function rankSeries(series: any[], parameter: "pm25" | "pm10" = "pm25"): Array<{ id: number; code: string }> {
  const want = parameter === "pm25" ? /^PM\s?2\.?5\b/i : /^PM\s?10\b/i;
  return (series ?? [])
    .filter((s) => want.test(String(s.name ?? s.parameter_code ?? "")) && !/agg|monthly|yearly|daily/i.test(String(s.name ?? "")))
    .sort((a, b) => score(String(b.name ?? "")) - score(String(a.name ?? "")))
    .map((s) => ({ id: Number(s.id), code: String(s.name ?? s.parameter_code) }));
  function score(name: string): number {
    if (/1\s*h(ou)?r|_1H/i.test(name)) return 3;
    if (/inst/i.test(name)) return 2;
    if (/24\s*h|_24H/i.test(name)) return 1;
    return 0;
  }
}

/** Find a station by id or name: exact name first, then the shortest name containing the query. */
export function findStation(all: any[], q: string | number): any | undefined {
  if (typeof q === "number") return all.find((s) => s.id === q);
  const needle = q.toLowerCase().trim();
  const exact = all.find((s) => String(s.name).toLowerCase().trim() === needle);
  if (exact) return exact;
  return all.filter((s) => String(s.name).toLowerCase().includes(needle)).sort((a, b) => String(a.name).length - String(b.name).length)[0];
}

/** Hourly means (oldest → newest) from minute observations. */
export function hourlyMeans(data: Array<{ datetime: string; value: number }>): Array<{ hour: string; mean: number }> {
  const buckets = new Map<string, number[]>();
  for (const d of data) {
    const v = Number(d.value);
    if (!Number.isFinite(v) || v < 0) continue;
    const h = String(d.datetime).slice(0, 13);
    (buckets.get(h) ?? buckets.set(h, []).get(h)!).push(v);
  }
  return [...buckets.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([hour, vals]) => ({ hour, mean: vals.reduce((x, y) => x + y, 0) / vals.length }));
}

export interface AqiOptions extends SourceOptions {
  /** Station names (substring, case-insensitive) or ids. Default: Ratnapark (Kathmandu). */
  stations?: Array<string | number>;
  parameter?: "pm25" | "pm10";
  /** Hours of history to pull (default 24). */
  hours?: number;
  now?: Date;
}

/** Official Department of Environment air-quality readings (pollution.gov.np) with AQI. */
export async function doenvAqi(options: AqiOptions = {}): Promise<AqiSnapshot> {
  const f = fetchImpl(options.fetch);
  const want = options.stations ?? ["Ratnapark"];
  const parameter = options.parameter ?? "pm25";
  const res = await f(`${BASE}/station`, { headers: UA, signal: options.signal });
  if (!res.ok) throw new Error(`doenv ${res.status}`);
  const all = (await res.json()) as any[];
  const picked = want.map((w) => findStation(all, w)).filter(Boolean);
  const now = options.now ?? new Date();
  const from = new Date(now.getTime() - (options.hours ?? 24) * 3600000);
  const fmt = (d: Date) => d.toISOString().slice(0, 19);
  const readings: AqiReading[] = [];
  for (const st of picked) {
    const ds = await f(`${BASE}/station/${st.id}/data-series`, { headers: UA, signal: options.signal });
    if (!ds.ok) continue;
    // The official portal reads the instantaneous series; hourly-mean series are sometimes empty.
    // Walk the ranked list until one returns observations in the window.
    let series: { id: number; code: string } | undefined;
    let hours: Array<{ hour: string; mean: number }> = [];
    for (const cand of rankSeries((await ds.json()) as any[], parameter)) {
      const r = await f(`${BASE}/observation?series_id=${cand.id}&date_from=${fmt(from)}&date_to=${fmt(now)}`, { headers: UA, signal: options.signal });
      if (!r.ok) continue;
      const doc = await r.json();
      hours = hourlyMeans(doc?.data ?? []);
      if (hours.length) { series = cand; break; }
    }
    const last = hours[hours.length - 1];
    if (!series || !last) continue;
    const value = Math.round(last.mean * 10) / 10;
    const aqi = aqiFrom(value, parameter);
    readings.push({
      stationId: Number(st.id), station: String(st.name).replace(/_/g, " "), stationNe: (st.meta_data ?? []).find((m: any) => /nepali name/i.test(m.name))?.value || undefined,
      parameter: series.code, value, aqi, category: aqiCategory(aqi), at: last.hour + ":00", history: hours.slice(-24).map((h) => Math.round(h.mean)),
    });
  }
  return { kind: "aqi", readings, source: "Department of Environment", url: `${BASE}/station`, fetchedAt: new Date().toISOString() };
}
