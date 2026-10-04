/**
 * @lacspace/datanews — zero-AI bilingual (English / Nepali) news stories from structured data.
 *
 * Every number in the output comes from the input. Sentences whose data is missing are left
 * out (never "N/A"). Phrasing rotates with a seed derived from the date so consecutive days
 * don't read the same. No causes, quotes or judgement are invented.
 */

export type Lang = "en" | "ne";
export type Kind = "gold_silver" | "forex_nrb" | "nepse_close" | "weather_dhm" | "fuel_price";
export type Text = string | { en?: string; ne?: string };

export interface RenderOptions {
  lang?: Lang;
  /** Story date (ISO string or Date). Seeds the phrasing and is written in English text. */
  date?: string | Date;
  /** Pre-formatted date for the story text, per language (e.g. Bikram Sambat for Nepali). */
  dateLabel?: Text;
  /** Phrasing seed. Defaults to a hash of kind + date. */
  seed?: number;
  /** Attribution override. Defaults per kind; gold_silver has none unless given. */
  source?: Text;
  category?: string;
}

export interface DataStory {
  kind: Kind;
  lang: Lang;
  headline: string;
  deck: string;
  summary: string;
  body: string[];
  bullets: string[];
  tags: string[];
  category: string;
  numbers: { label: string; value: string }[];
}

export class DataNewsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataNewsError";
  }
}

// ---------- number formatting ----------
const DEV = "०१२३४५६७८९";
export function toDevanagari(s: string | number): string {
  return String(s).replace(/\d/g, (d) => DEV[Number(d)]!);
}
const MINUS = "−";
function trim(n: number, decimals: number): string {
  return Math.abs(n).toFixed(decimals).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}
/** English: international grouping (294,800). Nepali: South-Asian grouping in Devanagari (२,९४,८००). */
export function formatNumber(n: number, lang: Lang, decimals = 2): string {
  const [int, dec] = trim(n, decimals).split(".");
  const i = int!;
  const grouped =
    lang === "en"
      ? i.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
      : i.length <= 3
        ? i
        : i.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + i.slice(-3);
  const out = (n < 0 ? MINUS : "") + grouped + (dec ? "." + dec : "");
  return lang === "ne" ? toDevanagari(out) : out;
}
/** Fixed 2-decimal amount (rates): 138.10 / १३८.१० */
function fixed2(n: number, lang: Lang): string {
  const s = formatNumber(Math.trunc(n), lang, 0).replace(MINUS, "");
  const d = Math.abs(n).toFixed(2).split(".")[1]!;
  const out = (n < 0 ? MINUS : "") + s + "." + (lang === "ne" ? toDevanagari(d) : d);
  return out;
}
function rs(n: number, lang: Lang, decimals = 2): string {
  return lang === "en" ? `Rs ${formatNumber(n, "en", decimals)}` : `${formatNumber(n, "ne", decimals)} रुपैयाँ`;
}
/** Large amounts: Rs 4.12 billion / ४.१२ अर्ब रुपैयाँ */
export function formatBigMoney(n: number, lang: Lang): string {
  const a = Math.abs(n);
  if (lang === "en") {
    if (a >= 1e9) return `Rs ${formatNumber(n / 1e9, "en")} billion`;
    if (a >= 1e6) return `Rs ${formatNumber(n / 1e6, "en")} million`;
    return rs(n, "en");
  }
  if (a >= 1e9) return `${formatNumber(n / 1e9, "ne")} अर्ब रुपैयाँ`;
  if (a >= 1e7) return `${formatNumber(n / 1e7, "ne")} करोड रुपैयाँ`;
  if (a >= 1e5) return `${formatNumber(n / 1e5, "ne")} लाख रुपैयाँ`;
  return rs(n, "ne");
}
function pct(p: number, lang: Lang, signed = false): string {
  const v = formatNumber(Math.abs(p), lang, 2);
  const sign = signed ? (p > 0 ? "+" : p < 0 ? MINUS : "") : "";
  return `${sign}${v}%`;
}
/** Rs 0.15 → "15 paisa" / "१५ पैसा"; ≥ 1 → "Rs 1.25" / "१.२५ रुपैयाँ" */
function smallMoney(n: number, lang: Lang): string {
  const a = Math.abs(n);
  if (a < 1) {
    const p = Math.round(a * 100);
    return lang === "en" ? `${p} paisa` : `${toDevanagari(p)} पैसा`;
  }
  return rs(a, lang);
}

// ---------- helpers ----------
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
function pickText(t: Text | undefined, lang: Lang): string | undefined {
  if (t == null) return undefined;
  if (typeof t === "string") return t.trim() || undefined;
  return (t[lang] ?? (lang === "ne" ? undefined : t.ne))?.trim() || undefined;
}
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function chooser(seed: number) {
  return <T>(variants: readonly T[], slot: number): T => variants[(seed + slot * 7) % variants.length]!;
}
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function dateText(opts: RenderOptions, lang: Lang): string | undefined {
  const label = pickText(opts.dateLabel, lang);
  if (label) return label;
  if (lang === "ne" || !opts.date) return undefined;
  const d = typeof opts.date === "string" ? new Date(opts.date) : opts.date;
  if (Number.isNaN(d.getTime())) return undefined;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const endDot = (s: string, lang: Lang) => (/[.।!?]$/.test(s.trim()) ? s.trim() : s.trim() + (lang === "ne" ? "।" : "."));
const noDot = (s: string) => s.trim().replace(/[.।]+$/, "");
function dir(change: number | undefined): "up" | "down" | "flat" | "none" {
  if (!isNum(change)) return "none";
  return change > 0 ? "up" : change < 0 ? "down" : "flat";
}

interface Built {
  headline: string;
  deck: string;
  summary: string;
  body: string[];
  bullets: string[];
  numbers: { label: string; value: string }[];
  tags: string[];
  category: string;
}

// ---------- gold / silver ----------
export interface GoldSilverData {
  gold?: { perTola?: number; prev?: number };
  silver?: { perTola?: number; prev?: number };
  unit?: "tola" | "10g";
  currency?: "NPR";
}
function goldSilver(d: GoldSilverData, lang: Lang, pick: ReturnType<typeof chooser>, opts: RenderOptions): Built {
  const g = isNum(d.gold?.perTola) ? d.gold! : undefined;
  const s = isNum(d.silver?.perTola) ? d.silver! : undefined;
  if (!g && !s) throw new DataNewsError("gold_silver: neither gold.perTola nor silver.perTola given");
  const ten = d.unit === "10g";
  const per = lang === "en" ? (ten ? "per 10 grams" : "per tola") : ten ? "१० ग्राममा" : "तोलामा";
  const unitNe = ten ? "१० ग्रामको" : "तोलाको";
  const date = dateText(opts, lang);
  const src = pickText(opts.source, lang);
  const gd = g && isNum(g.prev) ? g.perTola! - g.prev : undefined;
  const sd = s && isNum(s.prev) ? s.perTola! - s.prev : undefined;

  const metal = (m: "gold" | "silver", price: number, diff: number | undefined, prev: number | undefined, slot: number) => {
    const en = m === "gold" ? "gold" : "silver";
    const ne = m === "gold" ? "सुन" : "चाँदी";
    const k = dir(diff);
    if (lang === "en") {
      if (k === "up") return pick([`The price of ${en} rose by ${rs(diff!, "en")} to ${rs(price, "en")} ${per}${date ? ` on ${date}` : ""}, up from ${rs(prev!, "en")}.`, `${cap(en)} gained ${rs(diff!, "en")} ${per} to ${rs(price, "en")}${date ? ` on ${date}` : ""}, from ${rs(prev!, "en")} previously.`], slot);
      if (k === "down") return pick([`The price of ${en} fell by ${rs(-diff!, "en")} to ${rs(price, "en")} ${per}${date ? ` on ${date}` : ""}, down from ${rs(prev!, "en")}.`, `${cap(en)} lost ${rs(-diff!, "en")} ${per} to ${rs(price, "en")}${date ? ` on ${date}` : ""}, from ${rs(prev!, "en")} previously.`], slot);
      if (k === "flat") return `The price of ${en} was unchanged at ${rs(price, "en")} ${per}${date ? ` on ${date}` : ""}.`;
      return `The price of ${en} stood at ${rs(price, "en")} ${per}${date ? ` on ${date}` : ""}.`;
    }
    const when = date ? `${date} ` : "";
    if (k === "up") return pick([`${when}${ne}को भाउ ${per} ${formatNumber(diff!, "ne")} रुपैयाँले बढेर ${rs(price, "ne")} पुगेको छ। यसअघि ${ne} ${unitNe} ${rs(prev!, "ne")} थियो।`, `${when}${ne} ${unitNe} ${formatNumber(diff!, "ne")} रुपैयाँले महँगिएर ${rs(price, "ne")} पुगेको छ। अघिल्लो भाउ ${rs(prev!, "ne")} थियो।`], slot);
    if (k === "down") return pick([`${when}${ne}को भाउ ${per} ${formatNumber(-diff!, "ne")} रुपैयाँले घटेर ${rs(price, "ne")} कायम भएको छ। यसअघि ${ne} ${unitNe} ${rs(prev!, "ne")} थियो।`, `${when}${ne} ${unitNe} ${formatNumber(-diff!, "ne")} रुपैयाँले सस्तिएर ${rs(price, "ne")} कायम भएको छ। अघिल्लो भाउ ${rs(prev!, "ne")} थियो।`], slot);
    if (k === "flat") return `${when}${ne}को भाउ ${unitNe} ${rs(price, "ne")} मा यथावत् छ।`;
    return `${when}${ne}को भाउ ${unitNe} ${rs(price, "ne")} छ।`;
  };

  // headline
  let headline: string;
  const silverTail = (lang: Lang) => (s ? (lang === "en" ? `; silver at ${rs(s.perTola!, "en")}` : `, चाँदी ${unitNe} ${rs(s.perTola!, "ne")}`) : "");
  if (g) {
    const k = dir(gd);
    if (lang === "en") {
      const p = ten ? "per 10 grams" : "per tola";
      headline =
        k === "up" ? pick([`Gold rises ${rs(gd!, "en")} to ${rs(g.perTola!, "en")} ${p}`, `Gold climbs to ${rs(g.perTola!, "en")} ${p}, up ${rs(gd!, "en")}`], 0)
        : k === "down" ? pick([`Gold falls ${rs(-gd!, "en")} to ${rs(g.perTola!, "en")} ${p}`, `Gold slips to ${rs(g.perTola!, "en")} ${p}, down ${rs(-gd!, "en")}`], 0)
        : k === "flat" ? `Gold steady at ${rs(g.perTola!, "en")} ${p}`
        : `Gold at ${rs(g.perTola!, "en")} ${p}`;
    } else {
      headline =
        k === "up" ? pick([`सुनको भाउ ${per} ${formatNumber(gd!, "ne")} रुपैयाँले बढेर ${rs(g.perTola!, "ne")} पुग्यो`, `सुन ${unitNe} ${formatNumber(gd!, "ne")} रुपैयाँले महँगियो, भाउ ${rs(g.perTola!, "ne")}`], 0)
        : k === "down" ? pick([`सुनको भाउ ${per} ${formatNumber(-gd!, "ne")} रुपैयाँले घटेर ${rs(g.perTola!, "ne")} कायम`, `सुन ${unitNe} ${formatNumber(-gd!, "ne")} रुपैयाँले सस्तियो, भाउ ${rs(g.perTola!, "ne")}`], 0)
        : k === "flat" ? `सुनको भाउ ${unitNe} ${rs(g.perTola!, "ne")} मा स्थिर`
        : `सुनको भाउ ${unitNe} ${rs(g.perTola!, "ne")}`;
    }
    headline += silverTail(lang);
  } else {
    headline = lang === "en" ? `Silver at ${rs(s!.perTola!, "en")} ${ten ? "per 10 grams" : "per tola"}` : `चाँदीको भाउ ${unitNe} ${rs(s!.perTola!, "ne")}`;
  }

  const body: string[] = [];
  const bullets: string[] = [];
  const numbers: Built["numbers"] = [];
  if (src) body.push(lang === "en" ? `According to ${src}, the following prices apply.` : `${src}का अनुसार बजार भाउ यस्तो छ।`);
  if (g) {
    body.push(metal("gold", g.perTola!, gd, g.prev, 1));
    if (isNum(gd) && gd !== 0 && g.prev) {
      const p = (gd / g.prev) * 100;
      body.push(lang === "en" ? `That is a change of ${pct(p, "en", true)}.` : `यो ${pct(p, "ne", true)} को परिवर्तन हो।`);
    }
    bullets.push(lang === "en" ? `Gold: ${rs(g.perTola!, "en")} ${ten ? "per 10 g" : "per tola"}${isNum(gd) && gd !== 0 ? ` (${gd > 0 ? "+" : MINUS}${formatNumber(Math.abs(gd), "en")})` : ""}` : `सुन: ${unitNe} ${rs(g.perTola!, "ne")}${isNum(gd) && gd !== 0 ? ` (${gd > 0 ? "+" : MINUS}${formatNumber(Math.abs(gd), "ne")})` : ""}`);
    numbers.push({ label: lang === "en" ? "Gold" : "सुन", value: rs(g.perTola!, lang) });
  }
  if (s) {
    body.push(metal("silver", s.perTola!, sd, s.prev, 2));
    bullets.push(lang === "en" ? `Silver: ${rs(s.perTola!, "en")} ${ten ? "per 10 g" : "per tola"}${isNum(sd) && sd !== 0 ? ` (${sd > 0 ? "+" : MINUS}${formatNumber(Math.abs(sd), "en")})` : ""}` : `चाँदी: ${unitNe} ${rs(s.perTola!, "ne")}${isNum(sd) && sd !== 0 ? ` (${sd > 0 ? "+" : MINUS}${formatNumber(Math.abs(sd), "ne")})` : ""}`);
    numbers.push({ label: lang === "en" ? "Silver" : "चाँदी", value: rs(s.perTola!, lang) });
  }
  if (g && isNum(g.prev)) {
    bullets.push(lang === "en" ? `Previous gold price: ${rs(g.prev, "en")}` : `सुनको अघिल्लो भाउ: ${rs(g.prev, "ne")}`);
    numbers.push({ label: lang === "en" ? "Gold (previous)" : "सुन (अघिल्लो)", value: rs(g.prev, lang) });
  }
  const deck = lang === "en"
    ? g && s ? `Gold and silver prices ${ten ? "per 10 grams" : "per tola"} in the domestic market.` : `Domestic ${g ? "gold" : "silver"} price ${ten ? "per 10 grams" : "per tola"}.`
    : g && s ? `स्वदेशी बजारमा सुन र चाँदीको ${ten ? "१० ग्राम" : "तोला"}को भाउ।` : `स्वदेशी बजारमा ${g ? "सुन" : "चाँदी"}को भाउ।`;
  return {
    headline, deck, summary: body.filter((x) => !x.startsWith("According") && !x.includes("का अनुसार")).slice(0, 2).join(" "), body, bullets, numbers,
    tags: lang === "en" ? ["gold", "silver", "prices", "markets"] : ["सुन", "चाँदी", "भाउ", "बजार"], category: "markets",
  };
}

// ---------- forex (NRB) ----------
export interface ForexRate { code: string; buy?: number; sell?: number; unit?: number; prevBuy?: number; prevSell?: number; name?: Text }
export interface ForexData { date?: string; rates: ForexRate[] }
const CURRENCY: Record<string, [string, string]> = {
  INR: ["Indian rupee", "भारतीय रुपैयाँ"], USD: ["US dollar", "अमेरिकी डलर"], EUR: ["euro", "युरो"], GBP: ["British pound", "बेलायती पाउन्ड"],
  CHF: ["Swiss franc", "स्विस फ्र्याङ्क"], AUD: ["Australian dollar", "अस्ट्रेलियाली डलर"], CAD: ["Canadian dollar", "क्यानेडियन डलर"],
  SGD: ["Singapore dollar", "सिङ्गापुर डलर"], JPY: ["Japanese yen", "जापानी येन"], CNY: ["Chinese yuan", "चिनियाँ युआन"],
  SAR: ["Saudi riyal", "साउदी रियाल"], QAR: ["Qatari riyal", "कतारी रियाल"], THB: ["Thai baht", "थाई बाट"], AED: ["UAE dirham", "यूएई दिराम"],
  MYR: ["Malaysian ringgit", "मलेसियाली रिङ्गेट"], KRW: ["South Korean won", "दक्षिण कोरियाली वन"], SEK: ["Swedish krona", "स्विडिस क्रोना"],
  DKK: ["Danish krone", "डेनिस क्रोन"], HKD: ["Hong Kong dollar", "हङकङ डलर"], KWD: ["Kuwaiti dinar", "कुवेती दिनार"],
  BHD: ["Bahraini dinar", "बहराइनी दिनार"], OMR: ["Omani rial", "ओमानी रियाल"],
};
const MAJORS = ["USD", "EUR", "GBP", "AUD", "CAD", "JPY", "CNY", "SAR", "QAR", "AED", "MYR", "KRW", "SGD", "CHF"];
function curName(r: ForexRate, lang: Lang): string {
  return pickText(r.name, lang) ?? CURRENCY[r.code]?.[lang === "en" ? 0 : 1] ?? r.code;
}
function forex(d: ForexData, lang: Lang, pick: ReturnType<typeof chooser>, opts: RenderOptions): Built {
  const rates = (d.rates ?? []).filter((r) => r && r.code && (isNum(r.buy) || isNum(r.sell)));
  if (!rates.length) throw new DataNewsError("forex_nrb: no usable rates");
  const src = pickText(opts.source, lang) ?? (lang === "en" ? "Nepal Rastra Bank" : "नेपाल राष्ट्र बैंक");
  const date = dateText(opts, lang);
  const move = (r: ForexRate) => (isNum(r.sell) && isNum(r.prevSell) && r.prevSell ? (r.sell - r.prevSell) / r.prevSell : undefined);
  const inr = rates.find((r) => r.code === "INR");
  const usd = rates.find((r) => r.code === "USD");
  const rest = rates.filter((r) => r.code !== "INR" && r.code !== "USD");
  const hasMoves = rest.some((r) => isNum(move(r)) && move(r) !== 0);
  const others = hasMoves
    ? [...rest].filter((r) => isNum(move(r))).sort((a, b) => Math.abs(move(b)!) - Math.abs(move(a)!))
    : [...rest].sort((a, b) => (MAJORS.indexOf(a.code) + 99) % 99 - (MAJORS.indexOf(b.code) + 99) % 99);
  const shown = [inr, usd, ...others].filter((x): x is ForexRate => !!x).slice(0, 5);

  const per = (r: ForexRate) => (r.unit && r.unit !== 1 ? (lang === "en" ? ` per ${r.unit}` : ` (प्रति ${toDevanagari(r.unit)})`) : "");
  const rateEn = (r: ForexRate) => [isNum(r.buy) ? `Rs ${fixed2(r.buy, "en")} buying` : "", isNum(r.sell) ? `Rs ${fixed2(r.sell, "en")} selling` : ""].filter(Boolean).join(" and ");
  const rateNe = (r: ForexRate) => [isNum(r.buy) ? `खरिददर ${fixed2(r.buy, "ne")} रुपैयाँ` : "", isNum(r.sell) ? `बिक्रीदर ${fixed2(r.sell, "ne")} रुपैयाँ` : ""].filter(Boolean).join(" र ");
  const changeEn = (r: ForexRate) => {
    if (!isNum(r.sell) || !isNum(r.prevSell)) return "";
    const c = r.sell - r.prevSell;
    return c === 0 ? ", unchanged from the previous rate" : `, ${c > 0 ? "up" : "down"} ${smallMoney(c, "en")} from the previous selling rate`;
  };
  const changeNe = (r: ForexRate) => {
    if (!isNum(r.sell) || !isNum(r.prevSell)) return "";
    const c = r.sell - r.prevSell;
    return c === 0 ? " अघिल्लो दरमा कुनै परिवर्तन छैन।" : ` अघिल्लो बिक्रीदरको तुलनामा ${smallMoney(c, "ne")}ले ${c > 0 ? "बढेको" : "घटेको"} हो।`;
  };

  const body: string[] = [];
  const bullets: string[] = [];
  const numbers: Built["numbers"] = [];
  const lead = shown[0]!;
  if (lang === "en") {
    body.push(`${src} has set the ${curName(lead, "en")} at ${rateEn(lead)}${per(lead)}${date ? ` for ${date}` : ""}${changeEn(lead)}.`);
  } else {
    body.push(`${src}ले ${date ? `${date} का लागि ` : ""}${curName(lead, "ne")}${per(lead)} को ${rateNe(lead)} तोकेको छ।${changeNe(lead)}`);
  }
  for (const r of shown.slice(1, 2)) body.push(lang === "en" ? `The ${curName(r, "en")} is at ${rateEn(r)}${per(r)}${changeEn(r)}.` : `${curName(r, "ne")}${per(r)} को ${rateNe(r)} छ।${changeNe(r)}`);
  const tail = shown.slice(2);
  if (tail.length) {
    const parts = tail.map((r) => (lang === "en" ? `the ${curName(r, "en")} at Rs ${isNum(r.sell) ? fixed2(r.sell, "en") : fixed2(r.buy!, "en")}${per(r)}${isNum(r.sell) && isNum(r.prevSell) && r.sell !== r.prevSell ? ` (${r.sell > r.prevSell ? "up" : "down"} ${smallMoney(r.sell - r.prevSell, "en")})` : ""}` : `${curName(r, "ne")}${per(r)} ${fixed2(isNum(r.sell) ? r.sell : r.buy!, "ne")} रुपैयाँ${isNum(r.sell) && isNum(r.prevSell) && r.sell !== r.prevSell ? ` (${smallMoney(r.sell - r.prevSell, "ne")}ले ${r.sell > r.prevSell ? "बढ्यो" : "घट्यो"})` : ""}`));
    body.push(lang === "en"
      ? `${hasMoves ? pick(["Among the biggest movers by selling rate were", "Other notable selling rates:"], 3) : "Other selling rates include"} ${parts.length > 1 ? parts.slice(0, -1).join(", ") + " and " + parts.at(-1) : parts[0]}.`
      : `${hasMoves ? "सबैभन्दा बढी उतारचढाव भएका मुद्रामध्ये" : "अन्य मुद्राको बिक्रीदर:"} ${parts.length > 1 ? parts.slice(0, -1).join(", ") + " र " + parts.at(-1) : parts[0]}।`);
  }
  body.push(lang === "en" ? `The rates are set by ${src} and may differ from those offered by commercial banks.` : `यी दर ${src}ले तोकेका हुन्; वाणिज्य बैंकहरूको दर फरक हुन सक्छ।`);
  for (const r of shown.slice(0, 3)) {
    bullets.push(lang === "en" ? `${cap(curName(r, "en"))}${per(r)}: ${rateEn(r)}` : `${curName(r, "ne")}${per(r)}: ${rateNe(r)}`);
  }
  for (const r of shown) numbers.push({ label: `${r.code}${r.unit && r.unit !== 1 ? ` (${lang === "en" ? r.unit : toDevanagari(r.unit)})` : ""}`, value: isNum(r.sell) ? `${fixed2(r.sell, lang)}` : fixed2(r.buy!, lang) });

  let headline: string;
  const h = usd ?? lead;
  const c = isNum(h.sell) && isNum(h.prevSell) ? h.sell - h.prevSell : undefined;
  const k = dir(c);
  if (lang === "en") {
    const name = cap(curName(h, "en"));
    headline =
      k === "up" ? pick([`${name} gains ${smallMoney(c!, "en")}, selling at Rs ${fixed2(h.sell!, "en")}`, `${name} up ${smallMoney(c!, "en")} at Rs ${fixed2(h.sell!, "en")} as NRB sets rates`], 0)
      : k === "down" ? pick([`${name} loses ${smallMoney(c!, "en")}, selling at Rs ${fixed2(h.sell!, "en")}`, `${name} down ${smallMoney(c!, "en")} at Rs ${fixed2(h.sell!, "en")} as NRB sets rates`], 0)
      : isNum(h.buy) && isNum(h.sell) ? `NRB sets ${curName(h, "en")} at Rs ${fixed2(h.buy, "en")} buying, Rs ${fixed2(h.sell, "en")} selling`
      : `NRB sets ${curName(h, "en")} at Rs ${fixed2((h.sell ?? h.buy)!, "en")}`;
  } else {
    const name = curName(h, "ne");
    headline =
      k === "up" ? pick([`${name} ${smallMoney(c!, "ne")}ले बलियो, बिक्रीदर ${fixed2(h.sell!, "ne")} रुपैयाँ`, `${name}को बिक्रीदर ${smallMoney(c!, "ne")}ले बढेर ${fixed2(h.sell!, "ne")} रुपैयाँ`], 0)
      : k === "down" ? pick([`${name} ${smallMoney(c!, "ne")}ले कमजोर, बिक्रीदर ${fixed2(h.sell!, "ne")} रुपैयाँ`, `${name}को बिक्रीदर ${smallMoney(c!, "ne")}ले घटेर ${fixed2(h.sell!, "ne")} रुपैयाँ`], 0)
      : `राष्ट्र बैंकद्वारा ${name}को ${rateNe(h)} तोकियो`;
  }
  return {
    headline,
    deck: lang === "en" ? `${src} published its foreign exchange rates${date ? ` for ${date}` : ""}.` : `${src}ले ${date ? `${date} का लागि ` : ""}विदेशी मुद्राको विनिमय दर सार्वजनिक गरेको छ।`,
    summary: body.slice(0, 2).join(" "), body, bullets, numbers,
    tags: lang === "en" ? ["forex", "exchange rate", "Nepal Rastra Bank", ...shown.map((r) => r.code)] : ["विदेशी विनिमय", "विनिमय दर", "राष्ट्र बैंक", ...shown.map((r) => r.code)],
    category: "markets",
  };
}

// ---------- NEPSE close ----------
export interface NepseData {
  index?: number; change?: number; changePct?: number; turnover?: number; volume?: number; transactions?: number;
  gainers?: { symbol: string; pct: number }[]; losers?: { symbol: string; pct: number }[];
}
function nepse(d: NepseData, lang: Lang, pick: ReturnType<typeof chooser>, opts: RenderOptions): Built {
  if (!isNum(d.index)) throw new DataNewsError("nepse_close: index missing");
  const date = dateText(opts, lang);
  const k = dir(d.change);
  const pts = isNum(d.change) ? formatNumber(Math.abs(d.change), lang) : "";
  const idx = formatNumber(d.index, lang);
  const pc = isNum(d.changePct) ? formatNumber(Math.abs(d.changePct), lang) : undefined;
  const t = isNum(d.turnover) ? d.turnover : undefined;
  let headline: string;
  if (lang === "en") {
    const tc = t === undefined ? "" : t >= 1e9 ? pick([` as turnover crosses Rs ${Math.floor(t / 1e9)} billion`, `; turnover ${formatBigMoney(t, "en")}`], 0) : `; turnover ${formatBigMoney(t, "en")}`;
    headline =
      k === "up" ? `${pick(["NEPSE rises", "NEPSE gains"], 0)} ${pts} points to ${idx}${tc}`
      : k === "down" ? `${pick(["NEPSE falls", "NEPSE slips"], 0)} ${pts} points to ${idx}${tc}`
      : k === "flat" ? `NEPSE unchanged at ${idx}${tc}` : `NEPSE closes at ${idx}${tc}`;
  } else {
    const tc = t === undefined ? "" : t >= 1e9 ? pick([`, कारोबार ${toDevanagari(Math.floor(t / 1e9))} अर्ब नाघ्यो`, `, कारोबार ${formatBigMoney(t, "ne")}`], 0) : `, कारोबार ${formatBigMoney(t, "ne")}`;
    headline =
      k === "up" ? `नेप्से ${pts} अंकले बढेर ${idx} मा${tc}`
      : k === "down" ? `नेप्से ${pts} अंकले घटेर ${idx} मा${tc}`
      : k === "flat" ? `नेप्से ${idx} मा स्थिर${tc}` : `नेप्से ${idx} मा बन्द${tc}`;
  }
  const body: string[] = [];
  const when = date ? (lang === "en" ? ` on ${date}` : `${date} `) : "";
  if (lang === "en") {
    body.push(
      k === "up" ? `The Nepal Stock Exchange (NEPSE) index rose ${pts} points${pc ? `, or ${pc}%,` : ""} to close at ${idx}${when}.`
      : k === "down" ? `The Nepal Stock Exchange (NEPSE) index fell ${pts} points${pc ? `, or ${pc}%,` : ""} to close at ${idx}${when}.`
      : k === "flat" ? `The Nepal Stock Exchange (NEPSE) index closed unchanged at ${idx}${when}.`
      : `The Nepal Stock Exchange (NEPSE) index closed at ${idx}${when}.`);
  } else {
    body.push(
      k === "up" ? `${when}नेपाल स्टक एक्सचेन्ज (नेप्से) परिसूचक ${pts} अंक${pc ? ` अर्थात् ${pc} प्रतिशत` : ""}ले बढेर ${idx} बिन्दुमा बन्द भएको छ।`
      : k === "down" ? `${when}नेपाल स्टक एक्सचेन्ज (नेप्से) परिसूचक ${pts} अंक${pc ? ` अर्थात् ${pc} प्रतिशत` : ""}ले घटेर ${idx} बिन्दुमा बन्द भएको छ।`
      : k === "flat" ? `${when}नेपाल स्टक एक्सचेन्ज (नेप्से) परिसूचक ${idx} बिन्दुमा यथावत् बन्द भएको छ।`
      : `${when}नेपाल स्टक एक्सचेन्ज (नेप्से) परिसूचक ${idx} बिन्दुमा बन्द भएको छ।`);
  }
  const vol = isNum(d.volume) ? formatNumber(d.volume, lang, 0) : undefined;
  const tx = isNum(d.transactions) ? formatNumber(d.transactions, lang, 0) : undefined;
  if (t !== undefined || vol) {
    if (lang === "en") {
      const bits = [t !== undefined ? `Turnover stood at ${formatBigMoney(t, "en")}` : "", vol ? `${t !== undefined ? "with " : ""}${vol} shares traded` : "", tx ? `in ${tx} transactions` : ""].filter(Boolean);
      body.push(cap(bits.join(", ").replace(", with", " with").replace(", in", " in")) + ".");
    } else {
      const bits = [t !== undefined ? `कुल ${formatBigMoney(t, "ne")}को कारोबार भएको छ` : "", vol ? `${vol} कित्ता सेयर किनबेच भएका छन्` : "", tx ? `${tx} पटक कारोबार भएको छ` : ""].filter(Boolean);
      body.push(bits.join(" भने ") + "।");
    }
  }
  const fmtMover = (m: { symbol: string; pct: number }) => `${m.symbol} (${pct(m.pct, lang, true)})`;
  const gs = (d.gainers ?? []).filter((m) => m?.symbol && isNum(m.pct)).slice(0, 3);
  const ls = (d.losers ?? []).filter((m) => m?.symbol && isNum(m.pct)).slice(0, 3);
  const list = (xs: string[]) => (lang === "en" ? (xs.length > 1 ? xs.slice(0, -1).join(", ") + " and " + xs.at(-1) : xs[0]!) : xs.length > 1 ? xs.slice(0, -1).join(", ") + " र " + xs.at(-1) : xs[0]!);
  if (gs.length) body.push(lang === "en" ? pick([gs.length > 1 ? `Top gainers were ${list(gs.map(fmtMover))}.` : `The top gainer was ${fmtMover(gs[0]!)}.`, `${list(gs.map(fmtMover))} led the gainers.`], 1) : `बढुवामा ${list(gs.map(fmtMover))} अग्रस्थानमा ${gs.length > 1 ? "रहे" : "रह्यो"}।`);
  if (ls.length) body.push(lang === "en" ? pick([ls.length > 1 ? `Top losers were ${list(ls.map(fmtMover))}.` : `The top loser was ${fmtMover(ls[0]!)}.`, `${list(ls.map(fmtMover))} fell the most.`], 2) : `घटुवामा ${list(ls.map(fmtMover))} अग्रस्थानमा ${ls.length > 1 ? "रहे" : "रह्यो"}।`);
  const bullets: string[] = [];
  const numbers: Built["numbers"] = [{ label: lang === "en" ? "NEPSE index" : "नेप्से परिसूचक", value: idx }];
  bullets.push(lang === "en" ? `NEPSE: ${idx}${isNum(d.change) ? ` (${d.change >= 0 ? "+" : MINUS}${pts}${pc ? `, ${d.change >= 0 ? "+" : MINUS}${pc}%` : ""})` : ""}` : `नेप्से: ${idx}${isNum(d.change) ? ` (${d.change >= 0 ? "+" : MINUS}${pts}${pc ? `, ${d.change >= 0 ? "+" : MINUS}${pc}%` : ""})` : ""}`);
  if (isNum(d.change)) numbers.push({ label: lang === "en" ? "Change" : "परिवर्तन", value: `${d.change >= 0 ? "+" : MINUS}${pts}` });
  if (t !== undefined) { bullets.push(lang === "en" ? `Turnover: ${formatBigMoney(t, "en")}` : `कारोबार: ${formatBigMoney(t, "ne")}`); numbers.push({ label: lang === "en" ? "Turnover" : "कारोबार", value: formatBigMoney(t, lang) }); }
  if (vol) numbers.push({ label: lang === "en" ? "Shares traded" : "कित्ता", value: vol });
  if (gs.length) bullets.push(lang === "en" ? `Top gainer: ${fmtMover(gs[0]!)}` : `सबैभन्दा बढी बढ्ने: ${fmtMover(gs[0]!)}`);
  else if (ls.length) bullets.push(lang === "en" ? `Top loser: ${fmtMover(ls[0]!)}` : `सबैभन्दा बढी घट्ने: ${fmtMover(ls[0]!)}`);
  else if (vol) bullets.push(lang === "en" ? `Shares traded: ${vol}` : `कारोबार भएका कित्ता: ${vol}`);
  return {
    headline,
    deck: lang === "en" ? `Closing figures from the Nepal Stock Exchange${date ? ` for ${date}` : ""}.` : `नेपाल स्टक एक्सचेन्जको ${date ? `${date} को ` : ""}बन्द तथ्याङ्क।`,
    summary: body.slice(0, 2).join(" "), body, bullets: bullets.slice(0, 3), numbers,
    tags: lang === "en" ? ["NEPSE", "share market", "stocks"] : ["नेप्से", "सेयर बजार", "शेयर"], category: "markets",
  };
}

// ---------- weather (DHM) ----------
export interface WeatherData { regions?: { name: Text; forecast: Text }[]; warnings?: Text[] }
function weather(d: WeatherData, lang: Lang, pick: ReturnType<typeof chooser>, opts: RenderOptions): Built {
  const src = pickText(opts.source, lang) ?? (lang === "en" ? "the Department of Hydrology and Meteorology" : "जल तथा मौसम विज्ञान विभाग");
  const regions = (d.regions ?? []).map((r) => ({ name: pickText(r.name, lang), forecast: pickText(r.forecast, lang) })).filter((r): r is { name: string; forecast: string } => !!r.name && !!r.forecast);
  const warnings = (d.warnings ?? []).map((w) => pickText(w, lang)).filter((w): w is string => !!w);
  if (!regions.length && !warnings.length) throw new DataNewsError("weather_dhm: no regions or warnings");
  const date = dateText(opts, lang);
  const headline = warnings.length
    ? lang === "en" ? `Weather alert: ${noDot(cap(warnings[0]!))}` : `मौसम चेतावनी: ${noDot(warnings[0]!)}`
    : lang === "en" ? `${pick(["Weather outlook", "Weather forecast"], 0)}: ${noDot(cap(regions[0]!.forecast))}` : `मौसम पूर्वानुमान: ${noDot(regions[0]!.forecast)}`;
  const body: string[] = [];
  if (warnings.length) {
    body.push(lang === "en"
      ? `${cap(src)} has issued ${warnings.length === 1 ? "a warning" : "warnings"}${date ? ` for ${date}` : ""}: ${warnings.map(noDot).join("; ")}.`
      : `${src}ले ${date ? `${date} का लागि ` : ""}चेतावनी जारी गरेको छ: ${warnings.map(noDot).join("; ")}।`);
  }
  const lines = regions.map((r) => (lang === "en" ? `${r.name}: ${endDot(r.forecast, "en")}` : `${r.name}: ${endDot(r.forecast, "ne")}`));
  if (lines.length) {
    const intro = lang === "en" ? `According to ${src}, the forecast${date && !warnings.length ? ` for ${date}` : ""} is as follows.` : `${src}का अनुसार ${date && !warnings.length ? `${date} को ` : ""}मौसम पूर्वानुमान यस्तो छ।`;
    body.push(intro);
    const per = Math.max(1, Math.ceil(lines.length / 3));
    for (let i = 0; i < lines.length && body.length < 5; i += per) body.push(lines.slice(i, i + per).join(" "));
  }
  const bullets = [...warnings.map((w) => (lang === "en" ? `Warning: ${noDot(w)}` : `चेतावनी: ${noDot(w)}`)), ...regions.map((r) => `${r.name}: ${noDot(r.forecast)}`)].slice(0, 3);
  return {
    headline,
    deck: lang === "en" ? `The latest forecast from ${src}.` : `${src}को पछिल्लो मौसम पूर्वानुमान।`,
    summary: body.slice(0, 2).join(" "), body, bullets,
    numbers: [],
    tags: lang === "en" ? ["weather", "forecast", ...(warnings.length ? ["weather warning"] : [])] : ["मौसम", "पूर्वानुमान", ...(warnings.length ? ["चेतावनी"] : [])],
    category: "weather",
  };
}

// ---------- fuel ----------
export interface FuelData {
  petrol?: number; diesel?: number; kerosene?: number; lpg?: number;
  prev?: { petrol?: number; diesel?: number; kerosene?: number; lpg?: number };
}
const FUELS = [
  ["petrol", "petrol", "पेट्रोल"], ["diesel", "diesel", "डिजेल"], ["kerosene", "kerosene", "मट्टीतेल"], ["lpg", "LPG", "एलपी ग्यास"],
] as const;
function fuel(d: FuelData, lang: Lang, pick: ReturnType<typeof chooser>, opts: RenderOptions): Built {
  const src = pickText(opts.source, lang) ?? (lang === "en" ? "Nepal Oil Corporation" : "नेपाल आयल निगम");
  const items = FUELS.filter(([k]) => isNum(d[k])).map(([k, en, ne]) => {
    const price = d[k]!; const prev = d.prev?.[k]; const diff = isNum(prev) ? price - prev : undefined;
    return { k, name: lang === "en" ? en : ne, price, prev, diff, lpg: k === "lpg" };
  });
  if (!items.length) throw new DataNewsError("fuel_price: no prices given");
  const unit = (lpg: boolean) => (lang === "en" ? (lpg ? "per cylinder" : "per litre") : lpg ? "प्रतिसिलिन्डर" : "प्रतिलिटर");
  const unitShort = (lpg: boolean) => (lang === "en" ? (lpg ? "a cylinder" : "a litre") : lpg ? "सिलिन्डरको" : "लिटरको");
  const changed = items.filter((i) => isNum(i.diff) && i.diff !== 0);
  const date = dateText(opts, lang);
  let headline: string;
  if (changed.length) {
    const [a, b] = changed;
    if (lang === "en") {
      headline = `${cap(a!.name)} ${a!.diff! > 0 ? "up" : "down"} ${rs(Math.abs(a!.diff!), "en")} to ${rs(a!.price, "en")} ${unitShort(a!.lpg)}`;
      if (b) headline += `; ${b.name} ${b.diff! > 0 ? "up" : "down"} ${rs(Math.abs(b.diff!), "en")}`;
    } else {
      headline = `${a!.name} ${unitShort(a!.lpg).replace(/को$/, "मा")} ${formatNumber(Math.abs(a!.diff!), "ne")} रुपैयाँले ${a!.diff! > 0 ? "महँगो" : "सस्तो"}, अब ${rs(a!.price, "ne")}`;
      if (b) headline += `; ${b.name} ${formatNumber(Math.abs(b.diff!), "ne")} रुपैयाँले ${b.diff! > 0 ? "महँगो" : "सस्तो"}`;
    }
  } else {
    const a = items[0]!;
    const allPrev = items.every((i) => isNum(i.prev));
    headline = lang === "en"
      ? allPrev ? `Fuel prices unchanged; ${a.name} at ${rs(a.price, "en")} ${unitShort(a.lpg)}` : `${cap(a.name)} at ${rs(a.price, "en")} ${unitShort(a.lpg)}${items[1] ? `, ${items[1].name} at ${rs(items[1].price, "en")}` : ""}`
      : allPrev ? `इन्धनको मूल्य यथावत्, ${a.name} ${unitShort(a.lpg)} ${rs(a.price, "ne")}` : `${a.name} ${unitShort(a.lpg)} ${rs(a.price, "ne")}${items[1] ? `, ${items[1].name} ${rs(items[1].price, "ne")}` : ""}`;
  }
  const sentence = (i: (typeof items)[number], slot: number) => {
    if (lang === "en") {
      if (isNum(i.diff) && i.diff !== 0) return pick([`${src} has ${i.diff > 0 ? "raised" : "cut"} the price of ${i.name} by ${rs(Math.abs(i.diff), "en")} to ${rs(i.price, "en")} ${unit(i.lpg)}.`, `The price of ${i.name} is now ${rs(i.price, "en")} ${unit(i.lpg)}, ${i.diff > 0 ? "up" : "down"} ${rs(Math.abs(i.diff), "en")} from ${rs(i.prev!, "en")}.`], slot);
      if (i.diff === 0) return `The price of ${i.name} remains ${rs(i.price, "en")} ${unit(i.lpg)}.`;
      return `The price of ${i.name} is ${rs(i.price, "en")} ${unit(i.lpg)}.`;
    }
    if (isNum(i.diff) && i.diff !== 0) return pick([`${src}ले ${i.name}को मूल्य ${unit(i.lpg)} ${formatNumber(Math.abs(i.diff), "ne")} रुपैयाँले ${i.diff > 0 ? "बढाएर" : "घटाएर"} ${rs(i.price, "ne")} कायम गरेको छ।`, `${i.name}को मूल्य ${unit(i.lpg)} ${rs(i.prev!, "ne")} बाट ${i.diff > 0 ? "बढेर" : "घटेर"} ${rs(i.price, "ne")} पुगेको छ।`], slot);
    if (i.diff === 0) return `${i.name}को मूल्य ${unitShort(i.lpg)} ${rs(i.price, "ne")} मा यथावत् छ।`;
    return `${i.name}को मूल्य ${unitShort(i.lpg)} ${rs(i.price, "ne")} छ।`;
  };
  const body: string[] = [];
  const ordered = [...changed, ...items.filter((i) => !changed.includes(i))];
  ordered.forEach((i, n) => body.push(sentence(i, n)));
  if (!changed.length && items.every((i) => isNum(i.prev))) body.unshift(lang === "en" ? `${src} has kept fuel prices unchanged${date ? ` for ${date}` : ""}.` : `${src}ले ${date ? `${date} का लागि ` : ""}इन्धनको मूल्य यथावत् राखेको छ।`);
  else if (!changed.length) body.unshift(lang === "en" ? `These are the fuel prices set by ${src}${date ? ` for ${date}` : ""}.` : `${src}ले तोकेको ${date ? `${date} को ` : ""}इन्धन मूल्य यस्तो छ।`);
  const merged: string[] = body.length > 5 ? [...body.slice(0, 4), body.slice(4).join(" ")] : body;
  const bullets = ordered.slice(0, 3).map((i) => `${lang === "en" ? cap(i.name) : i.name}: ${rs(i.price, lang)} ${unit(i.lpg)}${isNum(i.diff) && i.diff !== 0 ? ` (${i.diff > 0 ? "+" : MINUS}${formatNumber(Math.abs(i.diff), lang)})` : ""}`);
  return {
    headline,
    deck: lang === "en" ? `Fuel prices set by ${src}${date ? ` for ${date}` : ""}.` : `${src}ले तोकेको इन्धन मूल्य।`,
    summary: merged.slice(0, 2).join(" "), body: merged, bullets,
    numbers: items.map((i) => ({ label: lang === "en" ? cap(i.name) : i.name, value: rs(i.price, lang) })),
    tags: lang === "en" ? ["fuel", "petrol", "diesel", "Nepal Oil Corporation"] : ["इन्धन", "पेट्रोल", "डिजेल", "आयल निगम"],
    category: "economy",
  };
}

// ---------- public API ----------
export type DataFor<K extends Kind> =
  K extends "gold_silver" ? GoldSilverData : K extends "forex_nrb" ? ForexData : K extends "nepse_close" ? NepseData : K extends "weather_dhm" ? WeatherData : FuelData;

const RENDERERS = { gold_silver: goldSilver, forex_nrb: forex, nepse_close: nepse, weather_dhm: weather, fuel_price: fuel } as const;
export const KINDS = Object.keys(RENDERERS) as Kind[];

export function render<K extends Kind>(kind: K, data: DataFor<K>, options: RenderOptions = {}): DataStory {
  const fn = RENDERERS[kind] as unknown as (d: unknown, l: Lang, p: ReturnType<typeof chooser>, o: RenderOptions) => Built;
  if (!fn) throw new DataNewsError(`unknown kind: ${String(kind)}`);
  if (data == null || typeof data !== "object") throw new DataNewsError(`${kind}: data must be an object`);
  const lang: Lang = options.lang ?? "en";
  const dateKey = options.date ? (typeof options.date === "string" ? options.date : options.date.toISOString()).slice(0, 10) : "";
  const seed = options.seed ?? hash(kind + dateKey);
  const b = fn(data, lang, chooser(seed), options);
  const clean = (s: string) => {
    let out = s.replace(/\s+/g, " ").replace(/\s+([,.;।])/g, "$1").trim();
    if (lang === "ne") out = out.replace(/(रुपैयाँ|डलर|युरो|पाउन्ड|रियाल|येन|युआन|फ्र्याङ्क|दिराम|दिनार|बाट|वन|क्रोना|क्रोन|रिङ्गेट) (मा|बाट|को)(?=[\s,;।)]|$)/g, "$1$2");
    return out;
  };
  return {
    kind, lang,
    headline: clean(b.headline), deck: clean(b.deck), summary: clean(b.summary),
    body: b.body.map(clean).filter(Boolean), bullets: b.bullets.map(clean).filter(Boolean).slice(0, 3),
    tags: b.tags, category: options.category ?? b.category, numbers: b.numbers,
  };
}

/** Both languages at once (same seed, so the variants line up). */
export function renderBoth<K extends Kind>(kind: K, data: DataFor<K>, options: Omit<RenderOptions, "lang"> = {}): { en: DataStory; ne: DataStory } {
  return { en: render(kind, data, { ...options, lang: "en" }), ne: render(kind, data, { ...options, lang: "ne" }) };
}

export function describe() {
  return {
    name: "@lacspace/datanews",
    version: "1.0.0",
    summary: "Zero-AI bilingual (English/Nepali) news stories from structured data: gold/silver, NRB forex, NEPSE close, DHM weather, fuel prices.",
    commands: ["render(kind, data, { lang, date, dateLabel, seed, source })", "renderBoth(kind, data, options)", "formatNumber(n, lang)", "formatBigMoney(n, lang)", "toDevanagari(s)"],
    kinds: KINDS,
  };
}
