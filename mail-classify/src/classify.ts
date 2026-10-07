import { CATEGORIES, DEFAULT_PATTERNS, FOCUSED } from "./patterns";
import type { Category, ClassifyPatterns, Priority } from "./patterns";

/** An address as a string ("Anita <anita@acme.com>" or "anita@acme.com") or an object. */
export type AddressInput = string | { name?: string | null; address?: string | null } | null | undefined;

/** Anything with `get(name)` (Fetch `Headers`, a Map) or a plain object of header values. */
export type HeaderSource =
  | { get(name: string): string | undefined | null }
  | Record<string, string | string[] | undefined | null>;

export interface ClassifyInput {
  from: AddressInput;
  to?: AddressInput | AddressInput[];
  cc?: AddressInput | AddressInput[];
  subject?: string | null;
  /** A short plain-text preview of the body. */
  snippet?: string | null;
  /** The mailbox this message was delivered to. Used for "team" and "sent directly to me". */
  mailboxAddress?: string | null;
  /** True for mailing-list mail. When omitted, List-Id / List-Unsubscribe headers decide. */
  isList?: boolean;
  /** True when the message carries a calendar invite. When omitted, a text/calendar Content-Type decides. */
  hasInvite?: boolean;
  /** True when you already know and trust this sender (e.g. in contacts). Adds +2 priority. */
  knownSender?: boolean;
  /** Optional raw headers. Read: List-Id, List-Unsubscribe, Auto-Submitted, Precedence, Content-Type. */
  headers?: HeaderSource | null;
}

export interface ClassifyOptions {
  /** Replace any of the built-in patterns. */
  patterns?: Partial<ClassifyPatterns>;
  /** Categories that count as "focused" (+2 priority). Default FOCUSED. */
  focused?: readonly Category[];
  /** Score at or above which priority is "high". Default 5. */
  highAt?: number;
  /** Score at or below which priority is "low". Default 0. */
  lowAt?: number;
  /** Total to+cc recipients above which the message counts as a broadcast (-1). Default 6. */
  manyRecipients?: number;
}

export interface Classification {
  category: Category;
  priority: Priority;
  /** The raw priority score (see README for the weights). */
  score: number;
  /** Which rules fired, in order: first the category rule, then each priority adjustment. */
  reasons: string[];
}

export interface ParsedAddress {
  name: string;
  address: string;
}

/** Normalise an address input to `{ name, address }` (address lowercased). Never throws. */
export function parseAddress(input: AddressInput): ParsedAddress {
  if (input == null) return { name: "", address: "" };
  if (typeof input === "object") {
    const address = typeof input.address === "string" ? input.address : "";
    const name = typeof input.name === "string" ? input.name : "";
    // an object whose address is itself "Name <a@b>" still works
    if (/[<>]/.test(address)) {
      const p = parseAddress(address);
      return { name: name || p.name, address: p.address };
    }
    return { name: name.trim(), address: address.trim().toLowerCase() };
  }
  if (typeof input !== "string") return { name: "", address: "" };
  const s = input.trim();
  const angle = s.match(/^(.*)<([^<>]*)>\s*$/);
  if (angle) {
    const name = (angle[1] ?? "").trim().replace(/^"(.*)"$/, "$1").trim();
    return { name, address: (angle[2] ?? "").trim().toLowerCase() };
  }
  return { name: "", address: s.replace(/^mailto:/i, "").toLowerCase() };
}

/** Split "a@x.com, \"Doe, Jo\" <jo@y.com>" into separate addresses (commas inside quotes/brackets are kept). */
export function splitAddressList(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  let angle = 0;
  for (const ch of s) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === "<") angle++;
    else if (!quoted && ch === ">") angle = Math.max(0, angle - 1);
    if ((ch === "," || ch === ";") && !quoted && angle === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function addressList(v: AddressInput | AddressInput[] | undefined): ParsedAddress[] {
  if (v == null) return [];
  const arr = Array.isArray(v) ? v : [v];
  const out: ParsedAddress[] = [];
  for (const a of arr) {
    if (typeof a === "string") for (const part of splitAddressList(a)) out.push(parseAddress(part));
    else {
      const p = parseAddress(a);
      if (p.address || p.name) out.push(p);
    }
  }
  return out;
}

/** Read a header case-insensitively; repeated headers are joined with ", ". Never throws. */
export function getHeader(headers: HeaderSource | null | undefined, name: string): string | undefined {
  if (!headers || typeof headers !== "object") return undefined;
  try {
    const g = (headers as { get?: unknown }).get;
    if (typeof g === "function") {
      const v = (g as (n: string) => unknown).call(headers, name) ?? (g as (n: string) => unknown).call(headers, name.toLowerCase());
      if (v == null) return undefined;
      return Array.isArray(v) ? v.map(String).join(", ") : String(v);
    }
    const want = name.toLowerCase();
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() !== want) continue;
      const v = (headers as Record<string, unknown>)[k];
      if (v == null) return undefined;
      return Array.isArray(v) ? v.map(String).join(", ") : String(v);
    }
  } catch {
    /* ignore odd header objects */
  }
  return undefined;
}

function t(re: RegExp, s: string): boolean {
  re.lastIndex = 0; // safe with /g or /y patterns supplied by callers
  const r = re.test(s);
  re.lastIndex = 0;
  return r;
}

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

/**
 * Classify one message into a category and a priority. Pure, synchronous, never throws.
 * The category cascade (first match wins) is: calendar invite → social → finance →
 * recruiting → promotions → newsletters → notifications → team → personal →
 * calendar words → clients.
 */
export function classify(input: ClassifyInput, options: ClassifyOptions = {}): Classification {
  const i = (input && typeof input === "object" ? input : {}) as Partial<ClassifyInput>;
  const o = options && typeof options === "object" ? options : {};
  const p: ClassifyPatterns = { ...DEFAULT_PATTERNS, ...stripBad(o.patterns) };
  const focused = Array.isArray(o.focused) ? o.focused : FOCUSED;
  const highAt = typeof o.highAt === "number" && Number.isFinite(o.highAt) ? o.highAt : 5;
  const lowAt = typeof o.lowAt === "number" && Number.isFinite(o.lowAt) ? o.lowAt : 0;
  const manyLimit = typeof o.manyRecipients === "number" && Number.isFinite(o.manyRecipients) ? o.manyRecipients : 6;

  const reasons: string[] = [];
  const fromAddr = parseAddress(i.from as AddressInput);
  const from = fromAddr.address;
  const at = from.lastIndexOf("@");
  const local = at >= 0 ? from.slice(0, at) : from;
  const fromDomain = at >= 0 ? from.slice(at + 1) : "";
  const mailbox = parseAddress(i.mailboxAddress ?? "").address;
  const myAt = mailbox.lastIndexOf("@");
  const myDomain = myAt >= 0 ? mailbox.slice(myAt + 1) : "";
  const subject = str(i.subject);
  const snippet = str(i.snippet);
  const text = `${subject} ${snippet}`;
  const to = addressList(i.to);
  const cc = addressList(i.cc);

  // header signals (only when the caller did not decide)
  const h = i.headers ?? null;
  let isList = typeof i.isList === "boolean" ? i.isList : false;
  if (typeof i.isList !== "boolean" && h && (getHeader(h, "List-Id") || getHeader(h, "List-Unsubscribe"))) {
    isList = true;
    reasons.push("header:list");
  }
  let hasInvite = typeof i.hasInvite === "boolean" ? i.hasInvite : false;
  if (typeof i.hasInvite !== "boolean" && h && /text\/calendar/i.test(getHeader(h, "Content-Type") ?? "")) {
    hasInvite = true;
    reasons.push("header:calendar");
  }
  let headerAutomated = false;
  if (h) {
    const autoSub = (getHeader(h, "Auto-Submitted") ?? "").trim().toLowerCase();
    const precedence = (getHeader(h, "Precedence") ?? "").trim().toLowerCase();
    if ((autoSub && autoSub !== "no") || /^(bulk|list|junk|auto_reply)$/.test(precedence)) {
      headerAutomated = true;
      reasons.push("header:automated");
    }
  }

  const automatedSender = Boolean(from) && (t(p.automated, from) || t(p.noreplyLocal, local));
  const automated = automatedSender || headerAutomated;
  const directToMe = Boolean(mailbox) && to.some((a) => a.address === mailbox);
  const manyRecipients = to.length + cc.length > manyLimit;

  let category: Category;
  if (hasInvite || t(p.calendarIcs, text) || t(p.calendarSubject, subject)) {
    category = "calendar";
    reasons.push(hasInvite ? "calendar:invite" : t(p.calendarIcs, text) ? "calendar:ics" : "calendar:subject");
  } else if (fromDomain && t(p.socialDomain, fromDomain)) {
    category = "social";
    reasons.push("social:domain");
  } else if (t(p.finance, subject) || (t(p.finance, snippet) && t(p.financeSnippetConfirm, snippet))) {
    category = "finance";
    reasons.push(t(p.finance, subject) ? "finance:subject" : "finance:snippet");
  } else if (t(p.recruit, subject) || (t(p.recruit, snippet) && t(p.recruitSnippetConfirm, snippet))) {
    category = "recruiting";
    reasons.push(t(p.recruit, subject) ? "recruiting:subject" : "recruiting:snippet");
  } else if (t(p.promo, subject)) {
    category = "promotions";
    reasons.push("promotions:subject");
  } else if (isList || t(p.newsletter, text)) {
    category = "newsletters";
    reasons.push(isList ? "newsletters:list" : "newsletters:text");
  } else if (automated || (fromDomain && t(p.notificationDomain, fromDomain))) {
    category = "notifications";
    reasons.push(automatedSender ? "notifications:automated-sender" : headerAutomated ? "notifications:automated-header" : "notifications:domain");
  } else if (fromDomain && fromDomain === myDomain) {
    category = "team";
    reasons.push("team:same-domain");
  } else if (fromDomain && t(p.freeMail, fromDomain)) {
    category = "personal";
    reasons.push("personal:free-mail");
  } else if (t(p.calendar, subject) && !automated) {
    category = "calendar";
    reasons.push("calendar:words");
  } else {
    category = "clients";
    reasons.push("clients:default");
  }

  let score = 0;
  const add = (n: number, why: string) => {
    score += n;
    reasons.push(`${n > 0 ? "+" : ""}${n} ${why}`);
  };
  if (focused.includes(category)) add(2, "focused category");
  if (directToMe) add(1, "sent directly to me");
  if (i.knownSender === true) add(2, "known sender");
  if (t(p.urgent, text)) add(2, "urgent words");
  if (t(p.question, subject) || t(p.question, snippet)) add(1, "question");
  if (category === "finance") add(1, "finance");
  if (automated || isList) add(-3, "automated or list");
  if (manyRecipients) add(-1, "many recipients");
  if (category === "newsletters" || category === "promotions" || category === "social") add(-3, "bulk category");
  const priority: Priority = score >= highAt ? "high" : score <= lowAt ? "low" : "normal";
  return { category, priority, score, reasons };
}

function stripBad(pats: Partial<ClassifyPatterns> | undefined): Partial<ClassifyPatterns> {
  const out: Partial<ClassifyPatterns> = {};
  if (!pats || typeof pats !== "object") return out;
  for (const k of Object.keys(pats) as Array<keyof ClassifyPatterns>) {
    const v = pats[k];
    if (v instanceof RegExp) out[k] = v;
  }
  return out;
}

/** Bind options once and reuse: `const c = createClassifier({ patterns }); c(msg)`. */
export function createClassifier(options: ClassifyOptions = {}): (input: ClassifyInput) => Classification {
  return (input) => classify(input, options);
}

/** True when `value` is one of the 10 categories. */
export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}
