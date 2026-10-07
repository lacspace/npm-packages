/** Text heuristics: OTP codes, order/invoice/receipt numbers and totals, tracking numbers, flights. */

import type { Anchor } from "./html";
import { asciiDigits, findDate, findMoney, findTime } from "./money";
import type { Money } from "./money";
import type { Extraction } from "./types";

export interface HeuristicContext {
  subject: string;
  /** Body text with quoted replies already removed. */
  body: string;
  from: string;
  anchors: Anchor[];
  rupee: "NPR" | "INR";
}

const YEAR = /^(19|20)\d\d$/;

// ───────────────────────────── OTP ─────────────────────────────

const OTP_KW =
  /\b(?:otp|one[\s-]?time\s+(?:pass(?:word|code)?|code|pin)|verification\s+code|verification|verify|security\s+code|login\s+code|sign[\s-]?in\s+code|passcode|auth(?:entication)?\s+code|confirmation\s+code|2fa\s+code|code)\b|पासकोड|ओटीपी|ओ\.टी\.पी|प्रमाणीकरण|कोड/gi;
const NOT_OTP_CONTEXT = /(postal|zip|post|promo|coupon|discount|voucher|referral|area|country|dial|tracking|product|item|sku|hs|swift|ifsc|branch|qr|bar|source|colou?r|dress|error|status)[\s-]*$/i;

function kwPositions(line: string): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  for (const m of line.matchAll(OTP_KW)) {
    const start = m.index ?? 0;
    if (NOT_OTP_CONTEXT.test(line.slice(Math.max(0, start - 16), start))) continue;
    out.push({ start, end: start + m[0].length });
  }
  return out;
}

const CANDIDATE = /(?<![A-Za-z\d])(?<!\d[ \-.,:/])(\d{4,8})(?![A-Za-z\d])(?![ \-.,:/]\d)(?!\s?%)/g;
const BAD_PREFIX = /(?:NPR|NRs\.?|INR|Rs\.?|रु\.?|रू\.?|₹|USD|US\$|\$|EUR|€|GBP|£|[+*xX#]|a\/c|acc(?:oun)?t\.?|card|ending(?:\s+in)?|no\.|phone|tel|mobile|call|ph)\s*[:.]?\s*$/i;

interface OtpCand {
  code: string;
  score: number;
}

export function findOtp(ctx: HeuristicContext): Extraction | null {
  const lines = [ctx.subject, ...ctx.body.split("\n")].map(asciiDigits);
  const cands: OtpCand[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    const kws = kwPositions(line);
    if (kws.length === 0) continue;
    // Same line.
    for (const m of line.matchAll(CANDIDATE)) {
      const pos = m.index ?? 0;
      const code = m[1] as string;
      if (BAD_PREFIX.test(line.slice(Math.max(0, pos - 14), pos))) continue;
      let dist = Infinity;
      for (const k of kws) dist = Math.min(dist, pos >= k.end ? pos - k.end : k.start - (pos + code.length));
      const introduced = /(?:\bis|\bhai|हो|:|-|–)\s*$/i.test(line.slice(Math.max(0, pos - 6), pos));
      const after = kws.some((k) => pos >= k.end && (pos - k.end <= 25 || (introduced && pos - k.end <= 80)));
      if (YEAR.test(code) && !after) continue;
      const score = after ? 0.9 : dist <= 40 ? 0.8 : 0.65;
      cands.push({ code, score });
    }
    // A code on its own on one of the next two lines (big-number layouts).
    for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
      const l = (lines[j] as string).trim();
      const m = /^(?:[:\-–]\s*)?(\d{4,8})\.?$/.exec(l) ?? /^(\d{3})[\s-](\d{3})$/.exec(l);
      if (m) {
        const code = m[2] ? `${m[1]}${m[2]}` : (m[1] as string);
        if (!YEAR.test(code)) cands.push({ code, score: 0.85 });
        break;
      }
      if (l !== "") break;
    }
  }
  if (cands.length === 0) return null;
  cands.sort((a, b) => b.score - a.score);
  const best = cands[0] as OtpCand;
  const fields: Record<string, unknown> = { code: best.code };
  const all = lines.join("\n");
  const exp =
    /\b(?:valid|expires?|expiring|expiry|expire)\b[^.\n]{0,25}?(\d{1,4})\s*(minutes?|mins?|min|hours?|hrs?|hr|seconds?|secs?|sec)\b/i.exec(all) ??
    /(\d{1,4})\s*(मिनेट|मिनट|घण्टा|घन्टा|सेकेन्ड)/.exec(all);
  if (exp) {
    const n = Number(exp[1]);
    const unit = (exp[2] as string).toLowerCase();
    const minutes = /^h|घ/.test(unit) ? n * 60 : /^s|से/.test(unit) ? n / 60 : n;
    fields["expiresInMinutes"] = minutes;
  }
  return { type: "otp", fields, confidence: best.score, source: "heuristic" };
}

// ─────────────────────────── commerce ───────────────────────────

const ORDER_ID = /\b(?:order|purchase)\s*(?:(?:no\.?|number|num|id)\s*[:#.\-]?|[:#])\s*#?\s*([A-Z0-9][A-Z0-9\-]{3,30})\b|अर्डर\s*(?:नं\.?|नम्बर)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{3,30})/i;
const INVOICE_ID = /\b(?:invoice|bill)\s*(?:(?:no\.?|number|num|id)\s*[:#.\-]?|[:#])\s*#?\s*([A-Z0-9][A-Z0-9\-/]{2,30})\b|बिल\s*(?:नं\.?|नम्बर)\s*[:#]?\s*([A-Z0-9][A-Z0-9-/]{2,30})/i;
const TXN_ID = /\b(?:transaction|txn|trans\.?|reference|ref\.?|receipt|payment)\s*(?:code|no\.?|number|id|#)\s*[:#.\-]?\s*([A-Z0-9][A-Z0-9\-]{3,40})\b/i;

const TOTAL_LABELS: Array<[RegExp, number]> = [
  [/\bgrand\s+total\b/i, 6],
  [/\b(?:total\s+amount|order\s+total|total\s+paid|amount\s+paid|total\s+payable|amount\s+payable|amount\s+due|balance\s+due|total\s+due|total\s+charged|paid\s+amount)\b|कुल\s*रकम|भुक्तानी\s*रकम/i, 5],
  [/\btotal\b|जम्मा|कुल/i, 4],
  [/\b(?:amount|paid)\b|रकम/i, 2],
];
const NOT_TOTAL = /\bsub[\s-]?total\b|\bdiscount|\bsaving|\bshipping\b|\bdelivery\s+(?:fee|charge)|\b(?:tax|vat)\b(?!\s*(?:incl|inclusive))|\bcashback|\bbalance\b(?!\s+due)|\bfee\b|\bup\s+to\b|\boff\b/i;

function idValue(m: RegExpExecArray | null): string | undefined {
  if (!m) return undefined;
  const v = (m[1] ?? m[2] ?? "").replace(/[-/]+$/, "");
  if (!/\d/.test(v) || YEAR.test(v) || v.length < 3) return undefined;
  return v;
}

function firstId(lines: string[], re: RegExp): string | undefined {
  for (const l of lines) {
    const v = idValue(re.exec(l));
    if (v) return v;
  }
  return undefined;
}

export function findTotal(lines: string[], rupee: "NPR" | "INR"): Money | undefined {
  let best: { money: Money; prio: number; idx: number } | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    for (const [re, prio] of TOTAL_LABELS) {
      const lm = re.exec(line);
      if (!lm) continue;
      if (prio < 5 && NOT_TOTAL.test(line)) break;
      const labelEnd = (lm.index ?? 0) + lm[0].length;
      let money = findMoney(line.slice(labelEnd), rupee)[0];
      if (!money && line.slice(labelEnd).trim().replace(/[:\-–()]/g, "").trim() === "") {
        const next = (lines[i + 1] ?? "").trim();
        if (next && findMoney(next, rupee)[0]?.index === 0) money = findMoney(next, rupee)[0];
      }
      if (money && (!best || prio > best.prio || (prio === best.prio && i > best.idx))) {
        best = { money: { amount: money.amount, currency: money.currency }, prio, idx: i };
      }
      break;
    }
  }
  return best?.money;
}

/** Display name or domain of the From header, e.g. "Daraz". */
export function merchantFrom(from: string): string | undefined {
  if (!from) return undefined;
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>/.exec(from);
  const display = m?.[1]?.trim();
  if (display && !/^(no-?reply|noreply|do-?not-?reply|info|support|notifications?)$/i.test(display) && !display.includes("@")) return display;
  const addr = (m?.[2] ?? from).trim();
  const domain = addr.split("@")[1]?.toLowerCase();
  if (!domain) return undefined;
  const parts = domain.split(".").filter((p) => !/^(mail|email|e|news|info|noreply|notify|notifications|com|co|org|net|np|in|uk|io|gov|edu|ac)$/.test(p));
  const core = parts[parts.length - 1];
  return core ? core.charAt(0).toUpperCase() + core.slice(1) : undefined;
}

const STRONG_SUBJECT =
  /\b(?:receipt|invoice|order\s+(?:confirm|placed|received|#|no|number|id)|your\s+order|payment\s+(?:successful|success|received|confirm|complete)|you\s+paid|transaction\s+(?:successful|complete|receipt))|रसिद|भुक्तानी\s*सफल/i;

export function findCommerce(ctx: HeuristicContext): Extraction | null {
  const lines = [ctx.subject, ...ctx.body.split("\n")].map(asciiDigits);
  const orderNumber = firstId(lines, ORDER_ID);
  const invoiceNumber = firstId(lines, INVOICE_ID);
  const transactionId = firstId(lines, TXN_ID);
  const total = findTotal(lines.slice(1), ctx.rupee);
  const strong = STRONG_SUBJECT.test(ctx.subject);
  if (!orderNumber && !invoiceNumber && !transactionId && !(total && strong)) return null;

  const all = lines.join("\n");
  let type: Extraction["type"];
  if (invoiceNumber || /\binvoice\b/i.test(ctx.subject)) type = "invoice";
  else if (orderNumber) type = "order";
  else if (transactionId || /\b(receipt|paid|payment|transaction)\b|रसिद|भुक्तानी/i.test(all)) type = "receipt";
  else type = "order";

  const fields: Record<string, unknown> = {};
  if (orderNumber) fields["orderNumber"] = orderNumber;
  if (invoiceNumber) fields["invoiceNumber"] = invoiceNumber;
  if (transactionId) fields["transactionId"] = transactionId;
  if (total) fields["total"] = total;
  const merchant = merchantFrom(ctx.from);
  if (merchant) fields["merchant"] = merchant;
  const dueLine = lines.find((l) => /\bdue\s+(?:date|on|by)\b/i.test(l));
  const due = dueLine ? findDate(dueLine) : null;
  if (due) fields["dueDate"] = due.date;
  const date = findDate(lines.slice(1).find((l) => findDate(l) && l !== dueLine) ?? "");
  if (date) fields["date"] = date.date;

  const hasId = Boolean(orderNumber || invoiceNumber || transactionId);
  const confidence = hasId && total ? 0.75 : hasId ? 0.6 : 0.55;
  return { type, fields, confidence, source: "heuristic" };
}

// ─────────────────────────── shipments ───────────────────────────

const UPS = /\b1Z[0-9A-Z]{16}\b/;
const TRACK_LABEL = /\b(?:tracking|track|awb|air\s*way\s*bill|waybill|consignment|shipment|parcel)\s*(?:no\.?|number|id|code|#)?\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-]{7,34})\b/i;
const CARRIERS: Array<[RegExp, string]> = [
  [/\bDHL\b/i, "DHL"],
  [/\bFed\s?Ex\b/i, "FedEx"],
  [/\bUSPS\b/i, "USPS"],
  [/\bUPS\b/, "UPS"],
  [/\bAramex\b/i, "Aramex"],
  [/\bBlue\s?Dart\b/i, "Blue Dart"],
  [/\bDelhivery\b/i, "Delhivery"],
  [/\bDTDC\b/i, "DTDC"],
  [/\bEkart\b/i, "Ekart"],
  [/\bIndia\s+Post\b/i, "India Post"],
  [/\bNepal\s+Post\b/i, "Nepal Post"],
  [/\bPathao\b/i, "Pathao"],
  [/\bNepal\s+Can\s+Move\b|\bNCM\b/, "Nepal Can Move"],
  [/\bUpaya\b/i, "Upaya"],
  [/\bRoyal\s+Mail\b/i, "Royal Mail"],
  [/\bCanada\s+Post\b/i, "Canada Post"],
  [/\bAustralia\s+Post\b/i, "Australia Post"],
  [/\bTNT\b/, "TNT"],
  [/\bSF\s+Express\b/i, "SF Express"],
];

export function findShipment(ctx: HeuristicContext): Extraction | null {
  const lines = [ctx.subject, ...ctx.body.split("\n")].map(asciiDigits);
  const all = lines.join("\n");
  let trackingNumber: string | undefined;
  let carrier: string | undefined;
  let confidence = 0.7;
  const ups = UPS.exec(all);
  if (ups) {
    trackingNumber = ups[0];
    carrier = "UPS";
    confidence = 0.85;
  } else {
    for (const l of lines) {
      const m = TRACK_LABEL.exec(l);
      const v = m?.[1];
      if (v && /\d/.test(v) && !/^(?:number|code)$/i.test(v)) {
        trackingNumber = v;
        break;
      }
    }
  }
  if (!trackingNumber) return null;
  if (!carrier) {
    const hay = all + "\n" + ctx.from;
    for (const [re, name] of CARRIERS) {
      if (re.test(hay)) {
        carrier = name;
        break;
      }
    }
  }
  const fields: Record<string, unknown> = { trackingNumber };
  if (carrier) fields["carrier"] = carrier;
  const link =
    ctx.anchors.find((a) => /^https?:/i.test(a.href) && a.href.includes(trackingNumber as string)) ??
    ctx.anchors.find((a) => /^https?:/i.test(a.href) && /\btrack/i.test(a.text + " " + a.href));
  if (link) fields["trackingUrl"] = link.href;
  else {
    const u = /https?:\/\/[^\s<>"')]+/g;
    for (const m of all.matchAll(u)) {
      if (m[0].includes(trackingNumber) || /track/i.test(m[0])) {
        fields["trackingUrl"] = m[0].replace(/[.,]+$/, "");
        break;
      }
    }
  }
  if (/out\s+for\s+delivery/i.test(all)) fields["status"] = "out-for-delivery";
  else if (/\b(?:has\s+been|was|got)\s+delivered\b|\bdelivered\s+(?:successfully|to)\b/i.test(all)) fields["status"] = "delivered";
  else if (/\b(?:shipped|dispatched|on\s+its\s+way|in\s+transit|handed\s+over)\b|पठाइएको/i.test(all)) fields["status"] = "in-transit";
  const orderNumber = firstId(lines, ORDER_ID);
  if (orderNumber) fields["orderNumber"] = orderNumber;
  const merchant = merchantFrom(ctx.from);
  if (merchant) fields["merchant"] = merchant;
  return { type: "shipment", fields, confidence, source: "heuristic" };
}

// ─────────────────────────── flights ───────────────────────────

const FLIGHT_CONTEXT = /\b(?:flights?|e-?ticket|boarding|itinerary|pnr|departure|depart(?:s|ing)?|airlines?|airways|check-?in)\b|उडान|हवाई/i;
const FLIGHT_CODE = /\b([A-Z]{2}|[A-Z]\d|\d[A-Z])[\s-]?(\d{1,4})\b(?![:./]\d)/g;
const NOT_AIRLINE = new Set(
  "AM PM NO ID TO AT IN ON OF OR BY IS IT US UK HI OK MR MS DR ST ND RD TH VS CC PO PH TV EX RS NR PS GB KB MB IP SN HS VAT OR AN BE DO GO IF ME MY SO UP WE PC FY Q1 Q2 Q3 Q4 H1 H2 A4 A3 A5 P1 P2 R1 S1 V1 V2 T1 T2 T3 T4 T5 G1 G2 FL FN".split(" "),
);
const PNR = /\b(?:PNR|booking\s+(?:reference|ref\.?|code)|confirmation\s+(?:code|number|no\.?)|record\s+locator|reservation\s+(?:code|number))\s*(?:\([^)]{0,12}\))?\s*(?:no\.?|number|code)?\s*[:#\-]?\s*([A-Z0-9]{5,8})\b/i;
const ROUTE = /\b([A-Z]{3})\s*(?:→|->|–|—|-|to)\s*([A-Z]{3})\b/;

export function findFlights(ctx: HeuristicContext): Extraction | null {
  const lines = [ctx.subject, ...ctx.body.split("\n")].map(asciiDigits);
  if (!FLIGHT_CONTEXT.test(lines.join("\n"))) return null;
  const flights: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  let best = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    for (const m of line.matchAll(FLIGHT_CODE)) {
      const airline = m[1] as string;
      const num = m[2] as string;
      if (NOT_AIRLINE.has(airline)) continue;
      const pos = m.index ?? 0;
      const before = line.slice(Math.max(0, pos - 16), pos);
      const labelled = /\bflight\s*(?:no\.?|number|#)?\s*[:#]?\s*$/i.test(before);
      if (YEAR.test(num) && !labelled) continue;
      if (/(?:NPR|INR|Rs\.?|USD|\$|€|£)\s*$/i.test(before)) continue;
      const code = `${airline}${num}`;
      if (seen.has(code)) continue;
      seen.add(code);
      const near = [line, lines[i + 1] ?? "", lines[i + 2] ?? "", lines[i - 1] ?? ""];
      const f: Record<string, unknown> = { flightNumber: code, airlineCode: airline, number: num };
      const rest = line.slice(pos + m[0].length);
      const date = findDate(rest) ?? near.map(findDate).find(Boolean) ?? null;
      if (date) f["date"] = date.date;
      const time = findTime(rest) ?? near.map(findTime).find(Boolean) ?? null;
      if (time) f["time"] = time;
      const route = near.map((l) => ROUTE.exec(l)).find(Boolean);
      if (route) {
        f["from"] = route[1];
        f["to"] = route[2];
      }
      const conf = labelled ? 0.75 : date ? 0.65 : 0.5;
      best = Math.max(best, conf);
      flights.push(f);
    }
  }
  if (flights.length === 0) return null;
  const fields: Record<string, unknown> = { flights };
  for (const l of lines) {
    const p = PNR.exec(l);
    const v = p?.[1];
    if (v && /^[A-Z0-9]{5,8}$/.test(v) && !/^(?:NUMBER|CODE|DETAILS)$/.test(v)) {
      fields["reservationNumber"] = v;
      break;
    }
  }
  return { type: "flight", fields, confidence: best, source: "heuristic" };
}
