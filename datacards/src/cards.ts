import { NepaliDate, toDevanagari } from "@lacspace/nepali-date";
import type { BrandTheme, CardSizeName, CardSpec, Lang, Localized, TableRow } from "@lacspace/newscard";
import { AQI_LABELS } from "./sources/aqi.js";
import { iconFor, sparklineSvg, weatherIcon } from "./sparkline.js";
import { AqiSnapshot, ForexSnapshot, FuelSnapshot, GoldSnapshot, NepseSnapshot, Snapshot, WeatherSnapshot } from "./types.js";

export interface CardOptions {
  theme: BrandTheme;
  size?: CardSizeName;
  /** "en" | "ne" | "both" (default "both"). */
  lang?: Lang;
  /** Forex: currencies to show, in order. Default: remittance + major corridors. */
  currencies?: string[];
  /** Max table rows (default 8). */
  maxRows?: number;
  /** Optional history series (oldest → newest) for a sparkline, e.g. last 30 USD sells. */
  history?: number[];
  /** Extra hashtags (without #). */
  hashtags?: string[];
  /** Print the "Source: …" line on the card. Default false — cards carry no third-party names. */
  showSource?: boolean;
}

/** A finished, ready-to-render data post: newscard spec + copy + alt text + hashtags. */
export interface DataCard {
  kind: Snapshot["kind"];
  spec: CardSpec;
  caption: { en: string; ne: string };
  alt: string;
  hashtags: string[];
  /** Key figures a conductor can reuse (headline numbers, deltas). */
  facts: Record<string, string | number>;
}

export const DEFAULT_CURRENCIES = ["USD", "EUR", "GBP", "INR", "AUD", "AED", "SAR", "QAR", "MYR", "JPY", "KRW"];

// --- shared helpers ----------------------------------------------------------------
export function dateLine(ad: string | Date): { en: string; ne: string } {
  const d = typeof ad === "string" ? new Date(ad + "T06:00:00+05:45") : ad;
  const nd = new NepaliDate(d);
  const en = `${nd.format("D MMMM YYYY")} BS · ${d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kathmandu" })}`;
  const ne = `${nd.formatNepali("YYYY MMMM D")} · ${toDevanagari(d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kathmandu" }))}`;
  return { en, ne };
}

export function fmt(n: number, dp = 2): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
export function signed(n: number, dp = 2): string {
  return (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n), dp);
}
function tone(n: number | undefined): TableRow["tone"] {
  return n === undefined || n === 0 ? "flat" : n > 0 ? "up" : "down";
}
function ne(s: string): string {
  return toDevanagari(s);
}
function lakh(n: number): string {
  // Nepali grouping: 1,20,000 / 1.5 lakh / 2.3 crore
  if (n >= 1e7) return `${fmt(n / 1e7, 2)} crore`;
  if (n >= 1e5) return `${fmt(n / 1e5, 2)} lakh`;
  return fmt(n, 0);
}
function lakhNe(n: number): string {
  if (n >= 1e7) return `${ne(fmt(n / 1e7, 2))} करोड`;
  if (n >= 1e5) return `${ne(fmt(n / 1e5, 2))} लाख`;
  return ne(fmt(n, 0));
}
function base(o: CardOptions, kicker: Localized, headline: Localized, note: Localized): CardSpec {
  // No third-party names on published cards unless the caller opts in (house rule: no source/credit lines).
  return { theme: o.theme, size: o.size ?? "portrait", lang: o.lang ?? "both", type: "table", kicker, headline, note: o.showSource ? note : undefined };
}
function tags(base: string[], extra?: string[]): string[] {
  return [...new Set([...base, ...(extra ?? [])])];
}

// --- Forex -------------------------------------------------------------------------
export function forexCard(s: ForexSnapshot, o: CardOptions): DataCard {
  const want = o.currencies ?? DEFAULT_CURRENCIES;
  const rates = want.map((c) => s.rates.find((r) => r.iso3 === c)).filter(Boolean).slice(0, o.maxRows ?? 8) as ForexSnapshot["rates"];
  const d = dateLine(s.date);
  const rows: TableRow[] = rates.map((r) => ({
    cells: [r.unit > 1 ? `${r.iso3} (${r.unit})` : r.iso3, fmt(r.buy), fmt(r.sell), r.delta === undefined ? "–" : signed(r.delta)],
    tone: tone(r.delta),
  }));
  const spec = base(o, { en: "Exchange rates", ne: "विदेशी मुद्रा विनिमय दर" }, { en: d.en, ne: d.ne }, { en: "Source: Nepal Rastra Bank · NPR, buying/selling", ne: "स्रोत: नेपाल राष्ट्र बैंक · रु., खरिद/बिक्री" });
  spec.table = { columns: [{ en: "Currency", ne: "मुद्रा" }, { en: "Buy", ne: "खरिद" }, { en: "Sell", ne: "बिक्री" }, { en: "Change", ne: "परिवर्तन" }], rows, widths: [0.34, 0.22, 0.22, 0.22] };
  if (o.history && o.history.length > 1) spec.chart = { src: sparklineSvg(o.history, { color: o.theme.accent }), y: 0.72, h: 0.12 };
  const usd = rates.find((r) => r.iso3 === "USD") ?? rates[0];
  const dir = usd?.delta ? (usd.delta > 0 ? { en: "up", ne: "बढेर" } : { en: "down", ne: "घटेर" }) : { en: "unchanged", ne: "यथावत" };
  const caption = {
    en: usd ? `NRB forex for ${d.en.split(" · ")[1]}: US dollar ${dir.en} at Rs ${fmt(usd.sell)} (sell)${usd.delta ? `, ${signed(usd.delta)} from yesterday` : ""}.` : `NRB forex for ${d.en}.`,
    ne: usd ? `नेपाल राष्ट्र बैंकको आजको विनिमय दर: अमेरिकी डलर ${dir.ne} रु. ${ne(fmt(usd.sell))} (बिक्री)${usd.delta ? `, हिजोभन्दा ${ne(signed(usd.delta))}` : ""}।` : `आजको विनिमय दर।`,
  };
  return {
    kind: "forex", spec, caption, hashtags: tags(["forex", "NRB", "NepalEconomy", "ExchangeRate"], o.hashtags),
    alt: `Table of Nepal Rastra Bank exchange rates for ${s.date}: ${rates.map((r) => `${r.iso3} buy ${r.buy} sell ${r.sell}`).join("; ")}.`,
    facts: { date: s.date, ...(usd ? { usdSell: usd.sell, usdBuy: usd.buy, usdDelta: usd.delta ?? 0 } : {}), source: s.source },
  };
}

// --- Gold / silver -----------------------------------------------------------------
export function goldCard(s: GoldSnapshot, o: CardOptions): DataCard {
  const d = dateLine(s.date || new Date());
  const names: Record<string, { en: string; ne: string }> = { "gold-hallmark": { en: "Hallmark gold", ne: "छापावाल सुन" }, "gold-tejabi": { en: "Tejabi gold", ne: "तेजाबी सुन" }, silver: { en: "Silver", ne: "चाँदी" } };
  const lang = o.lang ?? "both";
  const rows: TableRow[] = s.rates.map((r) => {
    const n = names[r.key] ?? { en: r.label, ne: r.label };
    return { cells: [lang === "ne" ? n.ne : n.en, fmt(r.perTola, 0), r.per10g ? fmt(r.per10g, 0) : "–", r.delta === undefined ? "–" : signed(r.delta, 0)], tone: tone(r.delta) };
  });
  const spec = base(o, { en: "Gold & silver", ne: "सुन–चाँदी" }, { en: d.en, ne: d.ne }, { en: "Source: FENEGOSIDA · NPR per tola / 10 g", ne: "स्रोत: फेनेगोसिडा · रु. प्रति तोला / १० ग्राम" });
  spec.table = { columns: [{ en: "Metal", ne: "धातु" }, { en: "Per tola", ne: "प्रति तोला" }, { en: "Per 10 g", ne: "प्रति १० ग्राम" }, { en: "Change", ne: "परिवर्तन" }], rows, widths: [0.34, 0.24, 0.22, 0.2] };
  if (o.history && o.history.length > 1) spec.chart = { src: sparklineSvg(o.history, { color: o.theme.accent }), y: 0.72, h: 0.12 };
  const g = s.rates.find((r) => r.key === "gold-hallmark") ?? s.rates[0]!;
  const dir = g.delta ? (g.delta > 0 ? { en: "rises", ne: "बढ्यो" } : { en: "falls", ne: "घट्यो" }) : { en: "holds", ne: "यथावत" };
  return {
    kind: "gold", spec,
    caption: {
      en: `Gold ${dir.en}: hallmark gold at Rs ${lakh(g.perTola)} per tola${g.delta ? ` (${signed(g.delta, 0)})` : ""}.`,
      ne: `सुनको मूल्य ${dir.ne}: छापावाल सुन प्रति तोला रु. ${lakhNe(g.perTola)}${g.delta ? ` (${ne(signed(g.delta, 0))})` : ""}।`,
    },
    hashtags: tags(["GoldPrice", "Nepal", "सुन", "FENEGOSIDA"], o.hashtags),
    alt: `Gold and silver prices in Nepal for ${s.date}: ${s.rates.map((r) => `${r.label} Rs ${r.perTola} per tola`).join("; ")}.`,
    facts: { date: s.date, goldPerTola: g.perTola, goldDelta: g.delta ?? 0, source: s.source },
  };
}

// --- Fuel ------------------------------------------------------------------------
export function fuelCard(s: FuelSnapshot, o: CardOptions): DataCard {
  const d = dateLine(s.date);
  const names: Record<string, { en: string; ne: string }> = { petrol: { en: "Petrol", ne: "पेट्रोल" }, diesel: { en: "Diesel", ne: "डिजेल" }, kerosene: { en: "Kerosene", ne: "मट्टितेल" }, lpg: { en: "LPG (14.2 kg)", ne: "ग्यास (१४.२ के.जी.)" }, atf: { en: "ATF", ne: "हवाई इन्धन" } };
  const lang = o.lang ?? "both";
  const rows: TableRow[] = s.prices.map((p) => ({ cells: [lang === "ne" ? (names[p.key]?.ne ?? p.label) : (names[p.key]?.en ?? p.label), `${fmt(p.price, p.price % 1 ? 1 : 0)} / ${p.unit}`, p.delta === undefined ? "–" : signed(p.delta, 1)], tone: tone(p.delta) }));
  const spec = base(o, { en: "Fuel prices", ne: "इन्धनको मूल्य" }, { en: d.en, ne: d.ne }, { en: "Source: Nepal Oil Corporation · Kathmandu retail, NPR", ne: "स्रोत: नेपाल आयल निगम · काठमाडौं खुद्रा, रु." });
  spec.table = { columns: [{ en: "Fuel", ne: "इन्धन" }, { en: "Price", ne: "मूल्य" }, { en: "Change", ne: "परिवर्तन" }], rows, widths: [0.4, 0.36, 0.24] };
  const p = s.prices.find((x) => x.key === "petrol") ?? s.prices[0]!;
  const changed = s.prices.filter((x) => x.delta);
  return {
    kind: "fuel", spec,
    caption: {
      en: changed.length ? `NOC revises fuel prices: ${changed.map((x) => `${names[x.key]?.en ?? x.label} ${signed(x.delta!, 1)} to Rs ${fmt(x.price, 1)}/${x.unit}`).join(", ")}.` : `NOC fuel prices today: petrol Rs ${fmt(p.price, 1)} per litre.`,
      ne: changed.length ? `नेपाल आयल निगमले इन्धनको मूल्य परिवर्तन गर्‍यो: ${changed.map((x) => `${names[x.key]?.ne ?? x.label} ${ne(signed(x.delta!, 1))}, अब रु. ${ne(fmt(x.price, 1))}`).join(", ")}।` : `आजको इन्धन मूल्य: पेट्रोल प्रति लिटर रु. ${ne(fmt(p.price, 1))}।`,
    },
    hashtags: tags(["FuelPrice", "NOC", "Nepal", "Petrol"], o.hashtags),
    alt: `Nepal Oil Corporation fuel prices: ${s.prices.map((x) => `${x.label} Rs ${x.price} per ${x.unit}`).join("; ")}.`,
    facts: { date: s.date, petrol: p.price, changed: changed.length, source: s.source },
  };
}

// --- Weather ---------------------------------------------------------------------
export function weatherCard(s: WeatherSnapshot, o: CardOptions): DataCard {
  const lang = o.lang ?? "both";
  const rows: TableRow[] = s.stations.slice(0, o.maxRows ?? 6).map((st) => {
    const day = st.days[0];
    const t = day ? [day.minTemp, day.maxTemp].filter((x) => x !== undefined).map((x) => `${x}°`).join(" / ") || "–" : "–";
    const cond = day ? (lang === "ne" ? day.conditionNe ?? day.condition : lang === "en" ? day.condition ?? day.conditionNe : day.conditionNe ?? day.condition) ?? "–" : "–";
    const rain = day?.rainProbability !== undefined ? `${day.rainProbability}%` : "–";
    return { cells: [lang === "ne" ? st.nameNe ?? st.name : st.name, t, lang === "ne" ? ne(rain) : rain, cond], icon: weatherIcon(iconFor(day?.condition ?? day?.conditionNe), o.theme.fg) };
  });
  const special = s.bulletin?.special === true;
  const issued = s.issuedAt ? dateLine(new Date(s.issuedAt)) : dateLine(new Date());
  const spec = base(o, special ? { en: "Weather alert", ne: "मौसम चेतावनी" } : { en: "Weather", ne: "मौसम" }, { en: `Forecast · ${issued.en.split(" · ")[1]}`, ne: `मौसम पूर्वानुमान · ${issued.ne.split(" · ")[0]}` }, { en: "Source: DHM, Meteorological Forecasting Division", ne: "स्रोत: जल तथा मौसम विज्ञान विभाग" });
  if (special) spec.type = "breaking", spec.kicker = { en: "WEATHER ALERT", ne: "मौसम चेतावनी" }, spec.headline = s.bulletin!.title, spec.attribution = { en: "DHM special bulletin", ne: "जल तथा मौसम विज्ञान विभाग" };
  else spec.table = { columns: [{ en: "City", ne: "सहर" }, { en: "Min / Max", ne: "न्यून / अधिक" }, { en: "Rain", ne: "वर्षा" }, { en: "Sky", ne: "मौसम" }], rows, widths: [0.3, 0.22, 0.14, 0.34] };
  const ktm = s.stations.find((x) => /kathmandu|काठमाडौं/i.test(x.name + (x.nameNe ?? ""))) ?? s.stations[0];
  const kd = ktm?.days[0];
  return {
    kind: "weather", spec,
    caption: {
      en: special ? `DHM has issued a special weather bulletin: ${s.bulletin!.title}` : ktm && kd ? `Today's forecast: ${ktm.name} ${kd.condition ?? ""}${kd.maxTemp !== undefined ? `, up to ${kd.maxTemp}°C` : ""}${kd.rainProbability ? `, ${kd.rainProbability}% chance of rain` : ""}.` : "Today's DHM forecast.",
      ne: special ? `जल तथा मौसम विज्ञान विभागको विशेष बुलेटिन: ${s.bulletin!.title}` : ktm && kd ? `आजको मौसम: ${ktm.nameNe ?? ktm.name} ${kd.conditionNe ?? ""}${kd.maxTemp !== undefined ? `, अधिकतम ${ne(String(kd.maxTemp))}°C` : ""}${kd.rainProbability ? `, वर्षाको सम्भावना ${ne(String(kd.rainProbability))}%` : ""}।` : "आजको मौसम पूर्वानुमान।",
    },
    hashtags: tags(special ? ["WeatherAlert", "DHM", "Nepal", "मौसम"] : ["Weather", "DHM", "Nepal", "मौसम"], o.hashtags),
    alt: `DHM forecast table: ${s.stations.map((st) => `${st.name} ${st.days[0]?.condition ?? ""} ${st.days[0]?.minTemp ?? ""}-${st.days[0]?.maxTemp ?? ""}°C`).join("; ")}.`,
    facts: { issuedAt: s.issuedAt, special: special ? 1 : 0, stations: s.stations.length, source: s.source },
  };
}

// --- AQI -------------------------------------------------------------------------
export function aqiCard(s: AqiSnapshot, o: CardOptions): DataCard {
  const lang = o.lang ?? "both";
  const rows: TableRow[] = s.readings.map((r) => ({ cells: [lang === "ne" ? r.stationNe ?? r.station : r.station, String(r.aqi), `${r.value} µg/m³`, lang === "ne" ? AQI_LABELS[r.category].ne : AQI_LABELS[r.category].en], tone: r.aqi > 100 ? "down" : r.aqi <= 50 ? "up" : "flat" }));
  const top = s.readings[0];
  const d = dateLine(new Date());
  const spec = base(o, { en: "Air quality", ne: "वायु गुणस्तर" }, top ? { en: `AQI ${top.aqi} · ${AQI_LABELS[top.category].en}`, ne: `AQI ${ne(String(top.aqi))} · ${AQI_LABELS[top.category].ne}` } : { en: d.en, ne: d.ne }, { en: "Source: Department of Environment · PM2.5, 1-h mean", ne: "स्रोत: वातावरण विभाग · PM2.5, १ घण्टे औसत" });
  spec.table = { columns: [{ en: "Station", ne: "स्टेसन" }, { en: "AQI", ne: "AQI" }, { en: "PM2.5", ne: "PM2.5" }, { en: "Level", ne: "स्तर" }], rows, widths: [0.3, 0.14, 0.22, 0.34] };
  if (top?.history && top.history.length > 1) spec.chart = { src: sparklineSvg(top.history, { color: AQI_LABELS[top.category].color, type: "bars" }), y: 0.72, h: 0.12 };
  return {
    kind: "aqi", spec,
    caption: {
      en: top ? `Air quality in ${top.station}: AQI ${top.aqi} (${AQI_LABELS[top.category].en}), PM2.5 at ${top.value} µg/m³.` : "Air quality update.",
      ne: top ? `${top.stationNe ?? top.station}को वायु गुणस्तर: AQI ${ne(String(top.aqi))} (${AQI_LABELS[top.category].ne}), PM2.5 ${ne(String(top.value))} µg/m³।` : "वायु गुणस्तर अपडेट।",
    },
    hashtags: tags(["AQI", "AirQuality", "Kathmandu", "Nepal"], o.hashtags),
    alt: `Air quality table: ${s.readings.map((r) => `${r.station} AQI ${r.aqi} ${AQI_LABELS[r.category].en}`).join("; ")}.`,
    facts: top ? { station: top.station, aqi: top.aqi, category: top.category, pm25: top.value, source: s.source } : { source: s.source },
  };
}

// --- NEPSE -----------------------------------------------------------------------
export function nepseCard(s: NepseSnapshot, o: CardOptions): DataCard {
  const d = dateLine(s.date);
  const lang = o.lang ?? "both";
  const rows: TableRow[] = [
    { cells: [lang === "ne" ? "नेप्से सूचकांक" : "NEPSE index", fmt(s.index), signed(s.change), `${signed(s.changePct)}%`], tone: tone(s.change) },
    ...(s.turnover ? [{ cells: [lang === "ne" ? "कारोबार" : "Turnover", lang === "ne" ? `रु. ${lakhNe(s.turnover)}` : `Rs ${lakh(s.turnover)}`, "", ""] } as TableRow] : []),
    ...(s.gainers ?? []).slice(0, 3).map((g) => ({ cells: [`▲ ${g.symbol}`, fmt(g.ltp), "", `${signed(g.changePct)}%`], tone: "up" as const })),
    ...(s.losers ?? []).slice(0, 3).map((g) => ({ cells: [`▼ ${g.symbol}`, fmt(g.ltp), "", `${signed(g.changePct)}%`], tone: "down" as const })),
  ];
  const spec = base(o, { en: "Share market", ne: "सेयर बजार" }, { en: d.en, ne: d.ne }, { en: "Source: Nepal Stock Exchange", ne: "स्रोत: नेपाल स्टक एक्सचेन्ज" });
  spec.table = { columns: [{ en: "", ne: "" }, { en: "Close", ne: "बन्द" }, { en: "Change", ne: "परिवर्तन" }, { en: "%", ne: "%" }], rows, widths: [0.38, 0.24, 0.2, 0.18] };
  if (o.history && o.history.length > 1) spec.chart = { src: sparklineSvg(o.history, { color: o.theme.accent, baseline: s.index - s.change }), y: 0.72, h: 0.12 };
  const dir = s.change > 0 ? { en: "gains", ne: "बढ्यो" } : s.change < 0 ? { en: "falls", ne: "घट्यो" } : { en: "flat", ne: "यथावत" };
  return {
    kind: "nepse", spec,
    caption: {
      en: `NEPSE ${dir.en} ${fmt(Math.abs(s.change))} points (${signed(s.changePct)}%) to close at ${fmt(s.index)}${s.turnover ? `; turnover Rs ${lakh(s.turnover)}` : ""}.`,
      ne: `नेप्से ${ne(fmt(Math.abs(s.change)))} अंक (${ne(signed(s.changePct))}%) ${dir.ne}, ${ne(fmt(s.index))} मा बन्द${s.turnover ? `; कारोबार रु. ${lakhNe(s.turnover)}` : ""}।`,
    },
    hashtags: tags(["NEPSE", "ShareMarket", "Nepal", "सेयरबजार"], o.hashtags),
    alt: `NEPSE closed at ${s.index} (${signed(s.change)}, ${signed(s.changePct)}%) on ${s.date}.`,
    facts: { date: s.date, index: s.index, change: s.change, changePct: s.changePct, source: s.source },
  };
}

/** Dispatch on snapshot kind. */
export function cardFor(s: Snapshot, o: CardOptions): DataCard {
  switch (s.kind) {
    case "forex": return forexCard(s, o);
    case "gold": return goldCard(s, o);
    case "fuel": return fuelCard(s, o);
    case "weather": return weatherCard(s, o);
    case "aqi": return aqiCard(s, o);
    case "nepse": return nepseCard(s, o);
  }
}
