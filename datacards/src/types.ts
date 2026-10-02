export type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string>; json(): Promise<any> }>;

export interface SourceOptions {
  fetch?: FetchLike;
  signal?: AbortSignal;
}

export function fetchImpl(f?: FetchLike): FetchLike {
  const impl = f ?? (globalThis as any).fetch;
  if (!impl) throw new Error("datacards: no fetch available — pass options.fetch");
  return impl;
}

export const UA = { "User-Agent": "lacspace-datacards/1.0 (+https://developer.lacspace.com/packages/datacards)" };

/** Every snapshot carries its official source + fetch time so cards can attribute honestly. */
export interface Provenance {
  source: string;
  url: string;
  fetchedAt: string;
}

// --- Forex (Nepal Rastra Bank) -----------------------------------------------------
export interface ForexRate {
  iso3: string;
  name: string;
  /** Units the quote is per (INR is per 100, JPY per 10). */
  unit: number;
  buy: number;
  sell: number;
  /** Change in sell vs the previous published day (same unit), if known. */
  delta?: number;
  deltaPct?: number;
}
export interface ForexSnapshot extends Provenance {
  kind: "forex";
  /** AD date (YYYY-MM-DD) the rates apply to. */
  date: string;
  rates: ForexRate[];
  previousDate?: string;
}

// --- Gold / silver (FENEGOSIDA) -----------------------------------------------------
export interface MetalRate {
  /** "gold-hallmark" | "gold-tejabi" | "silver" | raw label when unrecognised. */
  key: string;
  label: string;
  /** Price per tola (NPR). */
  perTola: number;
  per10g?: number;
  previousPerTola?: number;
  delta?: number;
}
export interface GoldSnapshot extends Provenance {
  kind: "gold";
  date: string;
  rates: MetalRate[];
}

// --- Fuel (Nepal Oil Corporation) ---------------------------------------------------
export interface FuelPrice {
  key: "petrol" | "diesel" | "kerosene" | "lpg" | "atf" | string;
  label: string;
  price: number;
  unit: string;
  delta?: number;
}
export interface FuelSnapshot extends Provenance {
  kind: "fuel";
  date: string;
  prices: FuelPrice[];
}

// --- Weather (DHM / MFD) -----------------------------------------------------------
export interface WeatherDay {
  /** 1 = today, 2 = tomorrow, 3 = day after (DHM "day" numbering). */
  day: number;
  date?: string;
  rainProbability?: number;
  minTemp?: number;
  maxTemp?: number;
  condition?: string;
  conditionNe?: string;
  /** DHM condition id (maps to an icon). */
  conditionId?: number;
}
export interface WeatherStation {
  id: number;
  name: string;
  nameNe?: string;
  latitude?: number;
  longitude?: number;
  sunrise?: string;
  sunset?: string;
  days: WeatherDay[];
}
export interface WeatherSnapshot extends Provenance {
  kind: "weather";
  issuedAt: string;
  stations: WeatherStation[];
  /** Latest DHM three-day bulletin title (Nepali), if fetched. */
  bulletin?: { title: string; issuedAt: string; special: boolean };
}

// --- Air quality (DoEnv pollution.gov.np) ------------------------------------------
export type AqiCategory = "good" | "moderate" | "unhealthy-sensitive" | "unhealthy" | "very-unhealthy" | "hazardous";
export interface AqiReading {
  stationId: number;
  station: string;
  stationNe?: string;
  parameter: string;
  /** µg/m³ (PM2.5 / PM10). */
  value: number;
  aqi: number;
  category: AqiCategory;
  at: string;
  /** Last 24 h of hourly means (oldest → newest) for sparklines. */
  history?: number[];
}
export interface AqiSnapshot extends Provenance {
  kind: "aqi";
  readings: AqiReading[];
}

// --- NEPSE (injected: official data needs a session token, so we normalise, not fetch) ----
export interface NepseMover {
  symbol: string;
  name?: string;
  ltp: number;
  changePct: number;
}
export interface NepseSnapshot extends Provenance {
  kind: "nepse";
  date: string;
  index: number;
  change: number;
  changePct: number;
  turnover?: number;
  volume?: number;
  gainers?: NepseMover[];
  losers?: NepseMover[];
}

export type Snapshot = ForexSnapshot | GoldSnapshot | FuelSnapshot | WeatherSnapshot | AqiSnapshot | NepseSnapshot;
export type DataKind = Snapshot["kind"];
