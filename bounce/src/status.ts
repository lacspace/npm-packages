/**
 * Map RFC 3463 enhanced status codes, SMTP basic reply codes and diagnostic
 * text to hard/soft plus a category.
 */

export type BounceCategory =
  | "mailbox_unknown"
  | "mailbox_full"
  | "domain_unknown"
  | "blocked_spam"
  | "blocked_policy"
  | "auth_failed"
  | "message_too_large"
  | "rate_limited"
  | "temporary"
  | "challenge"
  | "other";

export interface StatusClassification {
  kind: "hard" | "soft";
  category: BounceCategory;
}

const ENHANCED_RE = /(?<![\d.])([45])\.(\d{1,3})\.(\d{1,3})(?!\d|\.\d)/;
const BASIC_RE = /(?:^|[\s;:'"(\[#=])([45][0-5]\d)(?=[\s\-,.'")\]]|$)/;

/** Find an RFC 3463 enhanced status code ("5.1.1") in a string. */
export function findEnhancedStatus(s: string | undefined | null): string | undefined {
  if (!s) return undefined;
  const m = ENHANCED_RE.exec(String(s));
  return m ? `${m[1]}.${m[2]}.${m[3]}` : undefined;
}

/** Find a basic SMTP reply code ("550") in a string. */
export function findBasicCode(s: string | undefined | null): string | undefined {
  if (!s) return undefined;
  const m = BASIC_RE.exec(String(s));
  return m ? m[1] : undefined;
}

const HARD = new Set<BounceCategory>(["mailbox_unknown", "domain_unknown"]);

/** [category, specific]: specific codes win over diagnostic text. */
function fromEnhanced(cls: string, subject: number, detail: number): [BounceCategory, boolean] {
  const temp = cls === "4";
  switch (subject) {
    case 1:
      if (detail === 1 || detail === 10 || detail === 3 || detail === 6) return ["mailbox_unknown", true];
      if (detail === 2) return ["domain_unknown", true];
      if (detail === 7 || detail === 8) return ["blocked_policy", false];
      if (detail === 0) return [temp ? "temporary" : "mailbox_unknown", false];
      return ["other", false];
    case 2:
      if (detail === 1) return [temp ? "temporary" : "mailbox_unknown", true];
      if (detail === 2) return ["mailbox_full", true];
      if (detail === 3) return ["message_too_large", true];
      return [temp ? "temporary" : "other", false];
    case 3:
      if (detail === 4) return ["message_too_large", true];
      if (detail === 1) return ["mailbox_full", false];
      if (detail === 2) return ["temporary", false];
      return [temp ? "temporary" : "other", false];
    case 4:
      if (temp) return ["temporary", false];
      if (detail === 4) return ["domain_unknown", true];
      if (detail === 7) return ["temporary", true];
      if (detail === 1) return ["mailbox_unknown", false];
      if (detail === 2 || detail === 3) return ["temporary", false];
      return ["other", false];
    case 7: {
      if ([5, 7, 8, 9, 20, 21, 22, 23, 25, 26, 27, 509, 515].includes(detail)) return ["auth_failed", true];
      if (detail === 28) return [temp ? "rate_limited" : "blocked_spam", true];
      if ([511, 512, 606, 607, 708, 750].includes(detail)) return ["blocked_spam", true];
      return [temp ? "temporary" : "blocked_policy", false];
    }
    default:
      return [temp ? "temporary" : "other", false];
  }
}

const TEXT_RULES: Array<[BounceCategory, RegExp]> = [
  [
    "mailbox_full",
    /quota|mailbox (is )?full|mailbox.{0,20}\bfull\b|inbox is full|insufficient (system )?storage|storage (allocation|limit|space)|out of storage|mailbox size limit|exceeded (the )?(storage|mailbox)/i,
  ],
  [
    "message_too_large",
    /too large|too big|message size|size limit|exceeds? (the )?(max(imum)?|allowed|permitted)? ?(message )?size|message length exceeds/i,
  ],
  [
    "auth_failed",
    /dmarc|\bspf\b|\bdkim\b|unauthenticated|not authenticated|authentication (fail|requir|check)|sender.{0,20}authenticat|reverse dns|\bptr\b|rdns/i,
  ],
  [
    "blocked_spam",
    /spamhaus|spamcop|barracuda|sorbs|\bsurbl\b|\buribl\b|black ?list|block ?list|\b(dns)?rbl\b|\blisted (at|on|in|by)\b|\bspam\b|unsolicited|junk mail|bad reputation|low reputation|reputation|\babuse\b|phish|malicious|virus|malware/i,
  ],
  [
    "rate_limited",
    /rate limit|rate-limit|ratelimit|too many (messages|emails|mails|connections|recipients|requests)|throttl|unusual rate|sending rate|exceeded.{0,30}(rate|limit)|limit exceeded/i,
  ],
  [
    "domain_unknown",
    /domain\b[^.\n]{0,60}(couldn't|could not|cannot|can't) be found|domain (name )?not found|host or domain name not found|nxdomain|no mx|mx (record|lookup)|unrouteable|unroutable|domain (does ?n[o']t|did ?n[o']t) exist|no such domain|unknown domain|name or service not known|host not found|domain.{0,40}does not exist|invalid domain/i,
  ],
  [
    "mailbox_unknown",
    /user unknown|unknown user|no such (user|mailbox|recipient|account|address|person)|does ?n[o']t exist|was ?n[o']t found|address not found|(couldn't|could not|can't|cannot) be found|recipient ?not ?found|recipientnotfound|invalid (recipient|mailbox|address|user)|mailbox (is )?unavailable|mailbox not found|unknown (recipient|mailbox|local[- ]part|address|alias)|not a valid (mailbox|recipient|address)|user not found|account (has been |is )?(disabled|deactivated|closed|suspended|inactive)|mailbox (has been )?(disabled|deactivated|closed)|undeliverable address|no mailbox|does not like recipient|recipient address rejected: (user|undeliverable|unknown)|address rejected|unknown or illegal alias|bad destination mailbox/i,
  ],
  [
    "blocked_policy",
    /blocked|denied|policy|rejected|not (allowed|permitted|authorized)|prohibited|refused|banned|forbidden|restricted/i,
  ],
  [
    "temporary",
    /try again( later)?|temporar|deferred|greylist|graylist|timed? ?out|connection (refused|reset|lost)|service (not )?(currently )?unavailable|resources? (temporarily )?unavailable|will retry|retry later|delayed/i,
  ],
];

/** Category from diagnostic text alone, or undefined. */
export function categoryFromText(text: string | undefined | null): BounceCategory | undefined {
  if (!text) return undefined;
  const s = String(text);
  for (const [cat, re] of TEXT_RULES) if (re.test(s)) return cat;
  return undefined;
}

function fromBasic(code: string): BounceCategory {
  switch (code) {
    case "550":
    case "551":
    case "553":
      return "mailbox_unknown";
    case "552":
      return "mailbox_full";
    case "421":
    case "450":
    case "451":
    case "452":
      return "temporary";
    default:
      return code.startsWith("4") ? "temporary" : "other";
  }
}

/** hard/soft for a status class ("4"/"5"/undefined) and category. */
export function kindFor(cls: string | undefined, category: BounceCategory): "hard" | "soft" {
  if (cls === "4") return "soft";
  if (HARD.has(category)) return "hard";
  if (category === "other" && cls === "5") return "hard";
  return "soft";
}

/**
 * Classify an SMTP status. `code` may be an enhanced code ("5.1.1"), a basic
 * reply code ("550"), both ("550 5.1.1") or empty. `diagnostic` is the
 * server's text. Never throws.
 */
export function classifyStatus(code: string, diagnostic?: string): StatusClassification {
  try {
    const c = typeof code === "string" ? code : code == null ? "" : String(code);
    const d = typeof diagnostic === "string" ? diagnostic : "";
    const enhanced = findEnhancedStatus(c) ?? findEnhancedStatus(d);
    const basic = findBasicCode(" " + c) ?? findBasicCode(" " + d);
    let cls: string | undefined;
    let category: BounceCategory | undefined;
    let specific = false;
    if (enhanced) {
      const [k, s, det] = enhanced.split(".");
      cls = k;
      [category, specific] = fromEnhanced(k ?? "5", Number(s), Number(det));
    } else if (basic) {
      cls = basic.charAt(0);
    }
    if (!specific) {
      const t = categoryFromText(`${c} ${d}`);
      if (t && !(cls === "4" && HARD.has(t))) category = t;
      else if (!category && basic) category = fromBasic(basic);
    }
    if (!category) category = cls === "4" ? "temporary" : "other";
    return { kind: kindFor(cls, category), category };
  } catch {
    return { kind: "soft", category: "other" };
  }
}
