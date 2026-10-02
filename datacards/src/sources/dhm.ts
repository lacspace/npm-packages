import { fetchImpl, SourceOptions, UA, WeatherSnapshot, WeatherStation } from "../types.js";

const URL_WEATHER = "https://www.dhm.gov.np/mfd/api/weather";
const URL_BULLETIN = "https://www.dhm.gov.np/mfd/api/three-days-forecast-latest";

/** Words in a DHM bulletin title that mark it as a special/warning bulletin. */
const SPECIAL_RE = /विशेष|चेतावनी|सतर्क|सावधान|भारी|अति\s*भारी|बाढी|पहिरो|warning|alert|special|heavy/i;

/** Parse the DHM MFD /api/weather document into stations + per-day forecasts. */
export function parseDhmWeather(json: any, cities?: string[]): { issuedAt: string; stations: WeatherStation[] } {
  // Loose matching: DHM spells "Dhangadi", callers write "Dhangadhi" — compare with aspirates dropped.
  const loose = (s: string) => s.toLowerCase().replace(/h/g, "").replace(/[^a-zऀ-ॿ]/g, "");
  const want = cities?.map(loose);
  const stations: WeatherStation[] = [];
  for (const s of (json?.stations ?? []) as any[]) {
    const name = String(s.name ?? "");
    if (want && !want.some((w) => loose(name).includes(w) || loose(String(s.nepali_name ?? "")).includes(w))) continue;
    const days = ((s.manual_forecast ?? []) as any[]).map((d) => ({
      day: Number(d.day),
      rainProbability: d.rain_probability == null ? undefined : Number(d.rain_probability),
      minTemp: d.from_temperature == null ? undefined : Number(d.from_temperature),
      maxTemp: d.to_temperature == null ? undefined : Number(d.to_temperature),
      condition: d.weather?.name ?? undefined,
      conditionNe: d.weather?.nepali_name ?? undefined,
      conditionId: d.weather?.id == null ? undefined : Number(d.weather.id),
    })).sort((a, b) => a.day - b.day);
    // DHM publishes min (morning) and max (afternoon) as two "day" rows per date; fold into one day when both exist.
    stations.push({
      id: Number(s.id), name, nameNe: s.nepali_name ?? undefined, latitude: s.latitude, longitude: s.longitude,
      sunrise: s.sunrise ?? undefined, sunset: s.sunset ?? undefined, days: foldDays(days, s.datetime),
    });
  }
  // Keep the caller's city order when given.
  if (want) stations.sort((a, b) => want.findIndex((w) => loose(a.name).includes(w)) - want.findIndex((w) => loose(b.name).includes(w)));
  return { issuedAt: String(json?.datetime ?? ""), stations };
}

function foldDays(days: WeatherStation["days"], date?: string): WeatherStation["days"] {
  if (days.length === 2 && days[0]!.maxTemp === undefined && days[1]!.maxTemp === undefined && days[0]!.minTemp !== undefined && days[1]!.minTemp !== undefined) {
    // Row 1 = morning minimum, row 2 = afternoon maximum (DHM's "day 2/3" convention for the next day).
    const a = days[0]!, b = days[1]!;
    return [{
      day: 1, date, minTemp: Math.min(a.minTemp!, b.minTemp!), maxTemp: Math.max(a.minTemp!, b.minTemp!),
      rainProbability: Math.max(a.rainProbability ?? 0, b.rainProbability ?? 0),
      condition: b.condition ?? a.condition, conditionNe: b.conditionNe ?? a.conditionNe, conditionId: b.conditionId ?? a.conditionId,
    }];
  }
  return days.map((d) => ({ ...d, date }));
}

export interface DhmOptions extends SourceOptions {
  /** Station names to keep (case-insensitive substring; English or Nepali). Default: all. */
  cities?: string[];
  /** Also fetch the latest three-day bulletin title (default true). */
  bulletin?: boolean;
}

/** Official DHM (Department of Hydrology and Meteorology) city forecasts + latest bulletin. */
export async function dhmWeather(options: DhmOptions = {}): Promise<WeatherSnapshot> {
  const f = fetchImpl(options.fetch);
  const res = await f(URL_WEATHER, { headers: UA, signal: options.signal });
  if (!res.ok) throw new Error(`dhm ${res.status}`);
  const { issuedAt, stations } = parseDhmWeather(await res.json(), options.cities);
  const snap: WeatherSnapshot = { kind: "weather", issuedAt, stations, source: "DHM / Meteorological Forecasting Division", url: URL_WEATHER, fetchedAt: new Date().toISOString() };
  if (options.bulletin !== false) {
    try {
      const b = await f(URL_BULLETIN, { headers: UA, signal: options.signal });
      if (b.ok) {
        const rows = (await b.json()) as any[];
        const latest = rows?.[0];
        if (latest?.title) snap.bulletin = { title: String(latest.title), issuedAt: String(latest.issue_date ?? ""), special: SPECIAL_RE.test(String(latest.title)) };
      }
    } catch { /* bulletin is best-effort */ }
  }
  return snap;
}

export function isSpecialBulletin(title: string): boolean {
  return SPECIAL_RE.test(title);
}
