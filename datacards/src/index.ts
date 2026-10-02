import { CardOptions, cardFor, DataCard } from "./cards.js";
import { doenvAqi, AqiOptions } from "./sources/aqi.js";
import { dhmWeather, DhmOptions } from "./sources/dhm.js";
import { fenegosidaGold } from "./sources/gold.js";
import { nocFuel } from "./sources/noc.js";
import { nrbForex, NrbOptions } from "./sources/nrb.js";
import { DataKind, FuelPrice, Snapshot, SourceOptions } from "./types.js";

export * from "./types.js";
export * from "./cards.js";
export * from "./sparkline.js";
export * from "./video.js";
export { nrbForex, parseNrbPayload, withDeltas } from "./sources/nrb.js";
export { fenegosidaGold, parseFenegosida } from "./sources/gold.js";
export { nocFuel, parseNocHtml } from "./sources/noc.js";
export { dhmWeather, parseDhmWeather, isSpecialBulletin } from "./sources/dhm.js";
export { doenvAqi, aqiFrom, aqiCategory, AQI_LABELS, pickSeries, rankSeries, findStation, hourlyMeans } from "./sources/aqi.js";
export { nepseFromJson } from "./sources/nepse.js";
export type { NrbOptions, DhmOptions, AqiOptions };

const VERSION = "1.0.0";

export type FetchKind = Exclude<DataKind, "nepse">;

export interface FetchOptions extends SourceOptions {
  date?: string;
  cities?: string[];
  stations?: Array<string | number>;
  previousFuel?: FuelPrice[];
}

/** Fetch one official snapshot by kind (NEPSE is injected via nepseFromJson instead). */
export async function fetchSnapshot(kind: FetchKind, o: FetchOptions = {}): Promise<Snapshot> {
  switch (kind) {
    case "forex": return nrbForex({ date: o.date, fetch: o.fetch, signal: o.signal });
    case "gold": return fenegosidaGold({ fetch: o.fetch, signal: o.signal });
    case "fuel": return nocFuel({ fetch: o.fetch, signal: o.signal, previous: o.previousFuel });
    case "weather": return dhmWeather({ cities: o.cities ?? ["Kathmandu", "Pokhara", "Biratnagar", "Nepalgunj", "Dhangadhi"], fetch: o.fetch, signal: o.signal });
    case "aqi": return doenvAqi({ stations: o.stations, fetch: o.fetch, signal: o.signal });
  }
}

/** One call: fetch the official data and build the finished card (+ caption, alt, hashtags). */
export async function datacard(kind: FetchKind, card: CardOptions, fetchOpts: FetchOptions = {}): Promise<DataCard & { snapshot: Snapshot }> {
  const snapshot = await fetchSnapshot(kind, fetchOpts);
  return { ...cardFor(snapshot, card), snapshot };
}

/** Should this snapshot be posted? Skips unchanged fuel/gold and stale forex so the feed isn't spam. */
export function worthPosting(s: Snapshot, previous?: Snapshot): { post: boolean; reason: string } {
  if (!previous || previous.kind !== s.kind) return { post: true, reason: "first snapshot" };
  switch (s.kind) {
    case "forex": return s.date !== (previous as typeof s).date ? { post: true, reason: "new NRB day" } : { post: false, reason: "same NRB date" };
    case "gold": {
      const p = previous as typeof s;
      const changed = s.rates.some((r) => r.perTola !== p.rates.find((x) => x.key === r.key)?.perTola);
      return changed ? { post: true, reason: "rates changed" } : { post: false, reason: "unchanged" };
    }
    case "fuel": {
      const p = previous as typeof s;
      const changed = s.prices.some((r) => r.price !== p.prices.find((x) => x.key === r.key)?.price);
      return changed ? { post: true, reason: "prices changed" } : { post: false, reason: "unchanged" };
    }
    case "weather": {
      const p = previous as typeof s;
      if (s.bulletin?.special && s.bulletin.title !== p.bulletin?.title) return { post: true, reason: "new special bulletin" };
      return s.issuedAt !== p.issuedAt ? { post: true, reason: "new forecast issue" } : { post: false, reason: "same issue" };
    }
    case "aqi": {
      const p = previous as typeof s;
      const a = s.readings[0], b = p.readings[0];
      if (!a || !b) return { post: !!a, reason: a ? "first reading" : "no reading" };
      return a.category !== b.category ? { post: true, reason: `category ${b.category} → ${a.category}` } : { post: false, reason: "same category" };
    }
    case "nepse": return s.date !== (previous as typeof s).date ? { post: true, reason: "new trading day" } : { post: false, reason: "same day" };
  }
}

/** Machine-readable descriptor for an AI "conductor". */
export function describe() {
  return {
    name: "@lacspace/datacards",
    version: VERSION,
    summary: "Automatic data posts from official Nepal sources: NRB forex, FENEGOSIDA gold/silver, NOC fuel, DHM weather (+special bulletins), DoEnv AQI, and injected NEPSE — each as a bilingual newscard table/alert card with caption, alt text, hashtags, sparkline, and a montage video plan.",
    sources: { forex: "nrb.org.np", gold: "fenegosida.org", fuel: "noc.org.np", weather: "dhm.gov.np/mfd", aqi: "pollution.gov.np", nepse: "injected (nepseFromJson)" },
    commands: [
      { name: "datacard", input: { type: "object", properties: { kind: { enum: ["forex", "gold", "fuel", "weather", "aqi"] }, card: { type: "object", description: "CardOptions: theme, size, lang, currencies, history, hashtags" }, fetchOpts: { type: "object" } }, required: ["kind", "card"] }, output: "DataCard { spec (newscard CardSpec), caption{en,ne}, alt, hashtags, facts, snapshot }" },
      { name: "fetchSnapshot", input: { type: "object", properties: { kind: { type: "string" }, date: { type: "string" }, cities: { type: "array" }, stations: { type: "array" } }, required: ["kind"] }, output: "Snapshot" },
      { name: "cardFor", input: { type: "object", properties: { snapshot: { type: "object" }, card: { type: "object" } }, required: ["snapshot", "card"] }, output: "DataCard" },
      { name: "nepseFromJson", input: { type: "object", properties: { index: {}, gainers: { type: "array" }, losers: { type: "array" } } }, output: "NepseSnapshot" },
      { name: "worthPosting", input: { type: "object", properties: { snapshot: { type: "object" }, previous: { type: "object" } }, required: ["snapshot"] }, output: "{ post, reason }" },
      { name: "toMontage", input: { type: "object", properties: { cards: { type: "array" }, images: { type: "array" }, fontFile: { type: "string" }, output: { type: "string" }, preset: { type: "string" }, sting: { type: "object" }, lang: { enum: ["en", "ne"] } }, required: ["cards", "images", "fontFile", "output"] }, output: "montage TimelineSpec" },
    ],
  };
}
