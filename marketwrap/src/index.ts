/**
 * @lacspace/marketwrap — a deterministic market-wrap writer in English and Nepali.
 *
 * ```ts
 * import { marketWrap } from "@lacspace/marketwrap";
 *
 * const w = marketWrap({
 *   index: { name: "NEPSE", close: 2587.25, change: -11.9, pct: -0.45 },
 *   breadth: { up: 95, down: 238, flat: 23 },
 *   turnoverRs: 4293774181,
 *   sectors: [{ name: "Mutual Fund", pct: 0.2 }, { name: "Trading", pct: -0.96 }],
 * });
 * w.en; // "NEPSE fell 11.90 points (−0.45%) to 2,587.25. Decliners led 238 to 95. …"
 * w.ne; // "नेप्से ११.९० अंक (−०.४५%) घटेर २,५८७.२५ मा बन्द भयो। …"
 * ```
 *
 * Every number in the output comes from the input. The wording is descriptive only and
 * never says buy, sell, or predicts. Pass `seed` (e.g. the trading date) to rotate between
 * phrasings day to day; the same seed always gives the same text.
 */

const VERSION = "1.0.0";

export interface IndexMove {
  /** "NEPSE", "Sensitive", "Float", … */
  name: string;
  close: number;
  /** Points change from the previous close. */
  change: number;
  /** Percent change (−0.45 means −0.45%). Computed from close/change when omitted. */
  pct?: number;
}

export interface Mover {
  symbol: string;
  pct: number;
  /** Last traded price, optional. */
  ltp?: number;
}

export interface SectorMove {
  name: string;
  pct: number;
}

export interface WrapInput {
  index: IndexMove;
  breadth?: { up: number; down: number; flat?: number };
  /** Total turnover in rupees. */
  turnoverRs?: number;
  /** Shares traded (units). */
  volume?: number;
  /** Number of transactions. */
  trades?: number;
  sectors?: SectorMove[];
  gainers?: Mover[];
  losers?: Mover[];
}

export type WrapPart = "index" | "breadth" | "turnover" | "sectors" | "movers";

export interface WrapOptions {
  /**
   * Phrasing selector. Omitted → the first (house) phrasing of every sentence.
   * A string (e.g. "2026-10-04") or number picks a deterministic mix of variants.
   */
  seed?: string | number;
  /** Which sentences to write, in order. Default: index, breadth, turnover, sectors. Add "movers" for top gainer/loser. */
  parts?: WrapPart[];
  /** Nepali names for indices/sectors, merged over the built-in NEPSE sector map. */
  nepaliNames?: Record<string, string>;
  /** Currency prefix. Default "Rs" / "रु". */
  currency?: { en?: string; ne?: string };
}

export interface WrapResult {
  en: string;
  ne: string;
  headline: { en: string; ne: string };
  sentences: { en: string[]; ne: string[] };
  /** The numbers the text was built from (rounded as shown). */
  facts: {
    direction: "up" | "down" | "flat";
    points: number;
    pct: number;
    close: number;
    breadth?: { up: number; down: number; flat: number; leader: "advancers" | "decliners" | "level" };
    turnover?: { rs: number; en: string; ne: string };
    bestSector?: SectorMove;
    worstSector?: SectorMove;
    topGainer?: Mover;
    topLoser?: Mover;
  };
}

/* ------------------------------------------------------------------ numbers */

const DEV = ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"];
const MINUS = "−";

/** Convert ASCII digits to Devanagari digits. */
export function toDevanagari(s: string | number): string {
  return String(s).replace(/\d/g, (d) => DEV[Number(d)]!);
}

/** South-Asian grouping with fixed decimals: 2587.25 → "2,587.25", 1234567 → "12,34,567.00". */
export function groupSouthAsian(n: number, decimals = 2): string {
  const neg = n < 0;
  const [int, dec] = Math.abs(n).toFixed(decimals).split(".");
  const i = int!;
  const grouped = i.length <= 3 ? i : i.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + i.slice(-3);
  return (neg ? MINUS : "") + grouped + (dec ? "." + dec : "");
}

/** Signed percent: 0.2 → "+0.20%", −0.45 → "−0.45%", 0 → "0.00%". */
export function signedPct(p: number, decimals = 2): string {
  const v = Number(p.toFixed(decimals));
  const body = Math.abs(v).toFixed(decimals) + "%";
  return v > 0 ? "+" + body : v < 0 ? MINUS + body : body;
}

const SCALES: [number, string, string][] = [
  [1e11, "kharba", "खर्ब"],
  [1e9, "arba", "अर्ब"],
  [1e7, "crore", "करोड"],
  [1e5, "lakh", "लाख"],
];

/** Rupees in South-Asian scale words: 4293774181 → { en: "Rs 4.29 arba", ne: "रु ४.२९ अर्ब" }. */
export function rupeesInWords(rs: number, currency: { en?: string; ne?: string } = {}): { en: string; ne: string } {
  const a = Math.abs(rs);
  const u = SCALES.find(([size]) => a >= size);
  const num = u ? (a / u[0]).toFixed(2) : groupSouthAsian(a, 0);
  const sign = rs < 0 ? MINUS : "";
  const en = `${currency.en ?? "Rs"} ${sign}${num}${u ? " " + u[1] : ""}`;
  const ne = `${currency.ne ?? "रु"} ${sign}${toDevanagari(num)}${u ? " " + u[2] : ""}`;
  return { en, ne };
}

/* -------------------------------------------------------------------- names */

/** Nepali names for NEPSE indices and sectors (extend with `nepaliNames`). */
export const NEPALI_NAMES: Record<string, string> = {
  NEPSE: "नेप्से",
  Sensitive: "संवेदनशील परिसूचक",
  Float: "फ्लोट परिसूचक",
  "Sensitive Float": "संवेदनशील फ्लोट परिसूचक",
  Banking: "बैंकिङ",
  "Commercial Bank": "वाणिज्य बैंक",
  "Development Bank": "विकास बैंक",
  Finance: "वित्त",
  "Hotels And Tourism": "होटल तथा पर्यटन",
  "Hotels and Tourism": "होटल तथा पर्यटन",
  HydroPower: "जलविद्युत",
  Hydropower: "जलविद्युत",
  Investment: "लगानी",
  "Life Insurance": "जीवन बीमा",
  "Manufacturing And Processing": "उत्पादन तथा प्रशोधन",
  "Manufacturing and Processing": "उत्पादन तथा प्रशोधन",
  Microfinance: "लघुवित्त",
  "Mutual Fund": "म्युचुअल फन्ड",
  "Non Life Insurance": "निर्जीवन बीमा",
  "Non-Life Insurance": "निर्जीवन बीमा",
  Others: "अन्य",
  Trading: "व्यापार",
};

/* ---------------------------------------------------------------- variants */

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

type Pair = [en: string, ne: string];

function pick(options: Pair[], seed: string | number | undefined, part: string): Pair {
  if (seed === undefined) return options[0]!;
  return options[hash(`${seed}|${part}`) % options.length]!;
}

/* -------------------------------------------------------------------- wrap */

/** Write a bilingual market wrap from computed numbers. */
export function marketWrap(input: WrapInput, options: WrapOptions = {}): WrapResult {
  const names = { ...NEPALI_NAMES, ...(options.nepaliNames ?? {}) };
  const neName = (n: string) => names[n] ?? n;
  const parts = options.parts ?? ["index", "breadth", "turnover", "sectors"];
  const seed = options.seed;
  const D = toDevanagari;

  const ix = input.index;
  const prev = ix.close - ix.change;
  const pct = ix.pct ?? (prev ? (ix.change / prev) * 100 : 0);
  const points = Number(Math.abs(ix.change).toFixed(2));
  const direction: "up" | "down" | "flat" = points === 0 ? "flat" : ix.change > 0 ? "up" : "down";
  const close = groupSouthAsian(ix.close);
  const pts = Math.abs(ix.change).toFixed(2);
  const p = signedPct(pct);
  const nm = ix.name, nmNe = neName(ix.name);

  const facts: WrapResult["facts"] = { direction, points, pct: Number(pct.toFixed(2)), close: ix.close };
  const en: string[] = [], ne: string[] = [];

  for (const part of parts) {
    if (part === "index") {
      const opts: Pair[] =
        direction === "flat"
          ? [
              [`${nm} was unchanged at ${close}.`, `${nmNe} ${D(close)} मा स्थिर रह्यो।`],
              [`${nm} closed flat at ${close}.`, `${nmNe} कुनै परिवर्तनबिना ${D(close)} मा बन्द भयो।`],
            ]
          : direction === "down"
            ? [
                [`${nm} fell ${pts} points (${p}) to ${close}.`, `${nmNe} ${D(pts)} अंक (${D(p)}) घटेर ${D(close)} मा बन्द भयो।`],
                [`${nm} closed at ${close}, down ${pts} points (${p}).`, `${nmNe} ${D(pts)} अंक (${D(p)}) ओरालो लाग्दै ${D(close)} मा बन्द भयो।`],
                [`${nm} lost ${pts} points (${p}) to end at ${close}.`, `${nmNe} परिसूचक ${D(close)} मा बन्द भयो, जुन अघिल्लो दिनभन्दा ${D(pts)} अंक (${D(p)}) कम हो।`],
              ]
            : [
                [`${nm} rose ${pts} points (${p}) to ${close}.`, `${nmNe} ${D(pts)} अंक (${D(p)}) बढेर ${D(close)} मा बन्द भयो।`],
                [`${nm} closed at ${close}, up ${pts} points (${p}).`, `${nmNe} ${D(pts)} अंक (${D(p)}) उकालो लाग्दै ${D(close)} मा बन्द भयो।`],
                [`${nm} gained ${pts} points (${p}) to end at ${close}.`, `${nmNe} परिसूचक ${D(close)} मा बन्द भयो, जुन अघिल्लो दिनभन्दा ${D(pts)} अंक (${D(p)}) बढी हो।`],
              ];
      const [e, n] = pick(opts, seed, "index");
      en.push(e); ne.push(n);
    }

    if (part === "breadth" && input.breadth) {
      const { up, down } = input.breadth;
      const flat = input.breadth.flat ?? 0;
      const leader = up > down ? "advancers" : down > up ? "decliners" : "level";
      facts.breadth = { up, down, flat, leader };
      const flatEn = flat ? `, with ${flat} unchanged` : "";
      const flatNe = flat ? ` र ${D(flat)} को स्थिर रह्यो` : "";
      const opts: Pair[] =
        leader === "level"
          ? [[`Advancers and decliners were level at ${up} each${flatEn}.`, `${D(up)} कम्पनीको मूल्य बढ्यो, उत्तिकै ${D(down)} को घट्यो${flatNe}।`]]
          : leader === "decliners"
            ? [
                [`Decliners led ${down} to ${up}.`, `${D(down)} कम्पनीको शेयरमूल्य घट्यो भने ${D(up)} को बढ्यो${flatNe}।`],
                [`${down} stocks fell and ${up} rose${flatEn}.`, `${D(up)} कम्पनीको मूल्य बढ्दा ${D(down)} को घट्यो${flatNe}।`],
                [`Breadth was negative: ${down} decliners against ${up} advancers.`, `बजारमा घट्ने कम्पनी (${D(down)}) बढ्ने (${D(up)}) भन्दा धेरै थिए।`],
              ]
            : [
                [`Advancers led ${up} to ${down}.`, `${D(up)} कम्पनीको शेयरमूल्य बढ्यो भने ${D(down)} को घट्यो${flatNe}।`],
                [`${up} stocks rose and ${down} fell${flatEn}.`, `${D(down)} कम्पनीको मूल्य घट्दा ${D(up)} को बढ्यो${flatNe}।`],
                [`Breadth was positive: ${up} advancers against ${down} decliners.`, `बजारमा बढ्ने कम्पनी (${D(up)}) घट्ने (${D(down)}) भन्दा धेरै थिए।`],
              ];
      const [e, n] = pick(opts, seed, "breadth");
      en.push(e); ne.push(n);
    }

    if (part === "turnover" && input.turnoverRs !== undefined) {
      const t = rupeesInWords(input.turnoverRs, options.currency);
      facts.turnover = { rs: input.turnoverRs, ...t };
      const opts: Pair[] = [
        [`Turnover ${t.en}.`, `कारोबार रकम ${t.ne} रह्यो।`],
        [`Turnover was ${t.en}.`, `कुल ${t.ne} बराबरको कारोबार भयो।`],
        [`Shares worth ${t.en} changed hands.`, `दिनभरमा ${t.ne}को शेयर किनबेच भयो।`],
      ];
      const [e, n] = pick(opts, seed, "turnover");
      en.push(e); ne.push(n);
    }

    if (part === "sectors" && input.sectors && input.sectors.length >= 2) {
      const sorted = [...input.sectors].sort((a, b) => b.pct - a.pct);
      const best = sorted[0]!, worst = sorted[sorted.length - 1]!;
      facts.bestSector = best; facts.worstSector = worst;
      const bp = signedPct(best.pct), wp = signedPct(worst.pct);
      const bn = neName(best.name), wn = neName(worst.name);
      let opts: Pair[];
      if (worst.pct > 0)
        opts = [[`All sectors gained; ${best.name} led (${bp}) and ${worst.name} rose least (${wp}).`, `सबै उपसमूह बढे; ${bn} (${D(bp)}) सबैभन्दा धेरै र ${wn} (${D(wp)}) सबैभन्दा कम बढ्यो।`]];
      else if (best.pct < 0)
        opts = [[`All sectors fell; ${best.name} fell least (${bp}) and ${worst.name} most (${wp}).`, `सबै उपसमूह घटे; ${bn} (${D(bp)}) सबैभन्दा कम र ${wn} (${D(wp)}) सबैभन्दा धेरै घट्यो।`]];
      else
        opts = [
          [`${best.name} was the best sector (${bp}), ${worst.name} the weakest (${wp}).`, `उपसमूहतर्फ ${bn} (${D(bp)}) सबैभन्दा राम्रो र ${wn} (${D(wp)}) सबैभन्दा कमजोर रह्यो।`],
          [`Among sectors, ${best.name} led (${bp}) while ${worst.name} lagged (${wp}).`, `उपसमूहमध्ये ${bn} (${D(bp)}) अगाडि रह्यो भने ${wn} (${D(wp)}) पछाडि पर्‍यो।`],
          [`${best.name} topped the sector table (${bp}); ${worst.name} was at the bottom (${wp}).`, `उपसमूह तालिकामा ${bn} (${D(bp)}) शीर्षमा र ${wn} (${D(wp)}) पुछारमा रह्यो।`],
        ];
      const [e, n] = pick(opts, seed, "sectors");
      en.push(e); ne.push(n);
    }

    if (part === "movers") {
      const g = [...(input.gainers ?? [])].sort((a, b) => b.pct - a.pct)[0];
      const l = [...(input.losers ?? [])].sort((a, b) => a.pct - b.pct)[0];
      if (g) facts.topGainer = g;
      if (l) facts.topLoser = l;
      if (g && l) {
        const opts: Pair[] = [
          [`${g.symbol} was the top gainer (${signedPct(g.pct)}) and ${l.symbol} the top loser (${signedPct(l.pct)}).`, `${g.symbol} (${D(signedPct(g.pct))}) सबैभन्दा बढी बढ्यो भने ${l.symbol} (${D(signedPct(l.pct))}) सबैभन्दा बढी घट्यो।`],
          [`${g.symbol} gained the most (${signedPct(g.pct)}); ${l.symbol} fell the most (${signedPct(l.pct)}).`, `सबैभन्दा धेरै बढ्नेमा ${g.symbol} (${D(signedPct(g.pct))}) र घट्नेमा ${l.symbol} (${D(signedPct(l.pct))}) रहे।`],
        ];
        const [e, n] = pick(opts, seed, "movers");
        en.push(e); ne.push(n);
      } else if (g) {
        en.push(`${g.symbol} was the top gainer (${signedPct(g.pct)}).`);
        ne.push(`${g.symbol} (${D(signedPct(g.pct))}) सबैभन्दा बढी बढ्यो।`);
      } else if (l) {
        en.push(`${l.symbol} was the top loser (${signedPct(l.pct)}).`);
        ne.push(`${l.symbol} (${D(signedPct(l.pct))}) सबैभन्दा बढी घट्यो।`);
      }
    }
  }

  const headline =
    direction === "flat"
      ? { en: `${nm} flat at ${close}`, ne: `${nmNe} ${D(close)} मा स्थिर` }
      : direction === "down"
        ? { en: `${nm} down ${pts} points`, ne: `${nmNe} ${D(pts)} अंकले घट्यो` }
        : { en: `${nm} up ${pts} points`, ne: `${nmNe} ${D(pts)} अंकले बढ्यो` };

  return { en: en.join(" "), ne: ne.join(" "), headline, sentences: { en, ne }, facts };
}

/** describe() for agents/conductors. */
export function describe() {
  return {
    name: "@lacspace/marketwrap",
    version: VERSION,
    summary: "Deterministic bilingual (English/Nepali) stock-market wrap from computed numbers: index move, breadth, turnover (lakh/crore/arba), best/worst sector, top movers; seeded phrasing variants; no advice language; no AI.",
    commands: [
      {
        name: "marketWrap",
        input: {
          type: "object",
          properties: {
            index: { type: "object", properties: { name: { type: "string" }, close: { type: "number" }, change: { type: "number" }, pct: { type: "number" } }, required: ["name", "close", "change"] },
            breadth: { type: "object", properties: { up: { type: "integer" }, down: { type: "integer" }, flat: { type: "integer" } } },
            turnoverRs: { type: "number" },
            sectors: { type: "array", items: { type: "object", properties: { name: { type: "string" }, pct: { type: "number" } } } },
            gainers: { type: "array" },
            losers: { type: "array" },
            options: { type: "object", properties: { seed: { type: ["string", "number"] }, parts: { type: "array", items: { enum: ["index", "breadth", "turnover", "sectors", "movers"] } } } },
          },
          required: ["index"],
        },
        output: "{ en, ne, headline:{en,ne}, sentences:{en[],ne[]}, facts }",
      },
    ],
  };
}
