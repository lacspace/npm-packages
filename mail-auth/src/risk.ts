/**
 * assessRisk(): weighted phishing / impersonation heuristics that drive a
 * webmail "this message may be dangerous" banner. Heuristics, not a verdict.
 */
import type { AuthResults, Verdict } from "./authResults";
import {
  hasMixedScript,
  isFreeMail,
  isWholeScriptConfusable,
  lookalikeOf,
  registrableDomain,
  toUnicodeDomain,
} from "./domain";

export interface MailAddress {
  name?: string;
  address: string;
}

export interface RiskMessage {
  from: MailAddress;
  replyTo?: MailAddress[];
  returnPath?: string;
  subject?: string;
  snippet?: string;
  auth?: AuthResults | { spf?: Verdict; dkim?: Verdict; dmarc?: Verdict };
  /** Your user's own domain (e.g. "lacspace.com"): lookalikes of it are flagged. */
  recipientDomain?: string;
  /** Other domains your user trusts (partners, banks, your other brands). */
  trustedDomains?: string[];
  /** The user's address book / people they have emailed. */
  knownContacts?: MailAddress[];
  /** Links from the message body, e.g. from a mail sanitizer. */
  links?: { href: string; text: string }[];
}

export interface RiskOptions {
  /** Extra free-mail domains, added to FREE_MAIL_DOMAINS. */
  freeMailDomains?: string[];
  /** Extra brand / role names (added to the built-in list) that a free-mail sender should not claim. */
  brandNames?: string[];
}

export interface RiskSignal {
  code: string;
  weight: number;
  detail?: string;
}

export type RiskLevel = "none" | "low" | "high";

export interface RiskAssessment {
  level: RiskLevel;
  /** 0–100, the clamped sum of signal weights. */
  score: number;
  /** Plain-English reasons, strongest first, de-duplicated, at most 5, each ≤ 120 characters. */
  reasons: string[];
  signals: RiskSignal[];
}

/** score < low → "none"; low ≤ score < high → "low"; score ≥ high → "high". */
export const RISK_THRESHOLDS = Object.freeze({ low: 20, high: 50 });

/** Weight of every signal code (negative weights lower the score). */
export const SIGNAL_WEIGHTS = Object.freeze({
  "auth.dmarc_fail": 50,
  "auth.spf_fail": 25,
  "auth.spf_softfail": 15,
  "auth.dkim_fail": 20,
  "auth.unauthenticated": 10,
  "auth.dmarc_pass": -15,
  "reply_to.different_domain": 20,
  "reply_to.free_mail": 30,
  "display_name.other_address": 45,
  "display_name.claims_org": 30,
  "impersonation.known_contact": 45,
  "known_contact": -20,
  "lookalike.from": 50,
  "lookalike.reply_to": 35,
  "domain.mixed_script": 30,
  "domain.punycode": 10,
  "free_mail.brand": 40,
  "free_mail.role": 30,
  "content.payment_request": 35,
  "content.credential_request": 35,
  "content.urgent_request": 25,
  "content.cue": 5,
  "link.text_mismatch": 30,
  "link.ip_address": 25,
  "link.userinfo": 30,
  "link.punycode": 15,
  "link.lookalike": 40,
});

type Code = keyof typeof SIGNAL_WEIGHTS;

// ---------------------------------------------------------------------------
// Word lists
// ---------------------------------------------------------------------------

const BRANDS = [
  "microsoft", "office 365", "microsoft 365", "outlook", "apple", "icloud", "paypal", "google", "amazon",
  "netflix", "facebook", "instagram", "whatsapp", "linkedin", "dhl", "fedex", "docusign", "dropbox",
  "adobe", "bank", "banking", "esewa", "khalti", "fonepay", "visa", "mastercard", "tax office", "customs",
];

const ROLES = [
  "ceo", "cfo", "coo", "cto", "managing director", "director", "chairman", "president", "hr",
  "human resources", "payroll", "it department", "it support", "it team", "it helpdesk", "helpdesk",
  "help desk", "accounts", "accounts payable", "finance", "finance department", "billing department",
  "administrator", "admin team", "security team", "webmaster", "postmaster", "mail administrator",
];

const URGENCY: RegExp[] = [
  /\burgent(ly)?\b/, /\bimmediate(ly)?\b/, /\basap\b/, /as soon as possible/, /right away/,
  /within (1|2|12|24|48|72) ?(hours?|hrs?)\b/, /final (notice|warning|reminder)/, /\bact now\b/,
  /time[- ]sensitive/, /\bdeadline\b/, /expires? (today|soon|tonight)/, /\btoday only\b/,
  /\bturunt(ai)?\b/, /\bchhito\b/, /\baajai\b/, /तुरुन्तै/, /तुरुन्त/, /छिटो/, /आजै/, /अत्यावश्यक/,
];

const PAYMENT_PHRASES: RegExp[] = [
  /bank (account )?details (have |has )?(been )?(changed|updated)/,
  /(changed|updated|new) (our |my )?(bank|banking) (account|details)/,
  /new (bank )?account (details|number)/,
  /(urgent|immediate|same[- ]day) (wire|bank )?(transfer|payment|wire)/,
  /\bwire transfer\b/,
  /\bgift ?cards?\b/,
  /invoice.{0,40}(attached|overdue).{0,60}\b(pay|settle|remit)/,
  /please (pay|settle|remit).{0,40}invoice/,
  /\b(bitcoin|btc|crypto|cryptocurrency|usdt)\b/,
  /\bpaisa (pathau|pathaunu|pathaunus|pathaideu|transfer)/,
  /\bnaya khata\b/,
  /\bkhata (number|nambar|no\.?) (change|pariwartan|feri)/,
  /नयाँ खाता/, /खाता नम्बर/, /पैसा पठाउनु/, /रकम पठाउनु/,
];

const CREDENTIAL_PHRASES: RegExp[] = [
  /verify your (account|identity|email|mailbox|password)/,
  /password (will )?expires?/, /password expir/, /password has expired/,
  /account (has been |will be |is |was )?(suspended|locked|disabled|deactivated|closed|on hold)/,
  /unusual (sign[- ]?in|login|activity)/,
  /confirm your (password|credentials|login|account)/,
  /mailbox (is )?(full|quota)/, /re-?activate your account/,
  /पासवर्ड/, /खाता बन्द/,
];

const MONEY_WORDS: RegExp[] = [
  /\b(wire|transfer|payment|pay|invoice|bank|refund|funds?|remittance)\b/,
  /\b(paisa|bhuktani|khata|rakam)\b/, /पैसा|भुक्तानी|खाता|रकम|बैंक/,
];

const CRED_WORDS: RegExp[] = [/\b(password|login|log in|sign in|sign-in|credentials|verify)\b/, /पासवर्ड|लगइन/];

/** Subject tags added by the user's own gateway; they are informational and never raise risk. */
const EXTERNAL_TAG = /^\s*(?:\[(?:external|ext|extern|caution|outside)\]|\*{1,3}external\*{1,3}|external\s*:|caution\s*:)\s*/i;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMAIL_IN_TEXT = /[^\s<>"'(),;:@]+@[^\s<>"'(),;:@]+\.[^\s<>"'(),;:@]{2,}/;

function cleanAddress(a: unknown): string {
  if (typeof a !== "string") return "";
  const m = /<([^>]*)>/.exec(a);
  return (m ? m[1]! : a).trim().toLowerCase();
}

function domainOf(addr: string): string {
  const at = addr.lastIndexOf("@");
  return at < 0 ? "" : toUnicodeDomain(addr.slice(at + 1));
}

function normName(n: unknown): string {
  if (typeof n !== "string") return "";
  return n
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function short(s: string, max = 40): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function containsWord(haystack: string, word: string): boolean {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}($|[^\\p{L}\\p{N}])`, "iu").test(haystack);
}

function isFailing(v: Verdict | undefined): boolean {
  return v === "fail" || v === "softfail" || v === "permerror" || v === "policy";
}

const FILE_EXT = new Set(["pdf", "doc", "docx", "xls", "xlsx", "zip", "rar", "png", "jpg", "jpeg", "gif", "html", "htm", "php", "txt", "csv", "ppt", "pptx", "exe", "js", "svg"]);

function domainInText(text: string): string | null {
  const re = /(?:^|[\s<(\["'])(?:https?:\/\/)?((?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+\p{L}{2,})(?=$|[\s/:?#>)\]"',!]|\.(?:\s|$))/u;
  const m = re.exec(text);
  if (!m) return null;
  const host = m[1]!.toLowerCase();
  const tld = host.split(".").pop() ?? "";
  if (FILE_EXT.has(tld)) return null;
  return host;
}

function parseHref(href: string): { host: string; userinfo?: string } | null {
  const m = /^\s*([a-z][a-z0-9+.-]*):\/\/([^/?#\\]*)/i.exec(href);
  if (!m) return null;
  if (!/^https?$/i.test(m[1]!)) return null;
  const authority = m[2]!;
  const at = authority.lastIndexOf("@");
  const userinfo = at >= 0 ? authority.slice(0, at) : undefined;
  const hostport = authority.slice(at + 1);
  const host = hostport.startsWith("[")
    ? hostport.slice(0, hostport.indexOf("]") + 1)
    : hostport.split(":")[0]!;
  return { host: host.toLowerCase(), ...(userinfo !== undefined ? { userinfo } : {}) };
}

// ---------------------------------------------------------------------------
// assessRisk
// ---------------------------------------------------------------------------

interface Hit {
  code: Code;
  weight: number;
  reason: string;
  detail?: string;
}

/**
 * Score how likely a message is phishing or impersonation. Returns a level
 * ("none" | "low" | "high"), a 0–100 score, up to five plain-English reasons
 * and the raw signals. Never throws.
 */
export function assessRisk(msg: RiskMessage, opts: RiskOptions = {}): RiskAssessment {
  const hits: Hit[] = [];
  const add = (code: Code, reason: string, detail?: string, weight: number = SIGNAL_WEIGHTS[code]) => {
    if (hits.some((h) => h.code === code)) return;
    hits.push({ code, weight, reason, ...(detail !== undefined ? { detail } : {}) });
  };

  try {
    const freeExtra = opts.freeMailDomains ?? [];
    const fromAddr = cleanAddress(msg?.from?.address);
    const fromName = typeof msg?.from?.name === "string" ? msg.from.name.trim() : "";
    const fromDomain = domainOf(fromAddr);
    const fromReg = registrableDomain(fromDomain);
    const fromFree = fromDomain ? isFreeMail(fromDomain, freeExtra) : false;

    const contacts = (msg.knownContacts ?? []).filter((c) => c && typeof c.address === "string");
    const recipient = typeof msg.recipientDomain === "string" ? toUnicodeDomain(msg.recipientDomain) : "";
    const trusted = (msg.trustedDomains ?? []).filter((d) => typeof d === "string" && d.trim());
    const ownDomains = [recipient, ...trusted].filter(Boolean);
    const candidates = [
      ...ownDomains,
      ...contacts.map((c) => domainOf(cleanAddress(c.address))).filter(Boolean),
    ];
    const ownRegs = new Set(ownDomains.map((d) => registrableDomain(toUnicodeDomain(d))));
    const fromIsOwn = !!fromReg && ownRegs.has(fromReg);

    // ---- identity: lookalike domains -------------------------------------
    let spoofedIdentity = false;
    if (fromDomain && !fromFree) {
      const imitated = lookalikeOf(fromDomain, candidates);
      if (imitated) {
        spoofedIdentity = true;
        add("lookalike.from", `The sender's address (${short(fromAddr)}) looks like ${short(imitated, 30)} but is a different domain.`, imitated);
      }
      if (hasMixedScript(fromDomain) || isWholeScriptConfusable(fromDomain)) {
        spoofedIdentity = true;
        add("domain.mixed_script", `The sender's domain (${short(fromDomain)}) mixes letters from different alphabets to imitate another name.`, fromDomain);
      } else if (/(^|\.)xn--/i.test(cleanAddress(msg.from.address).split("@")[1] ?? "") || /[^\x00-\x7f]/.test(fromDomain)) {
        add("domain.punycode", `The sender's domain uses unusual international characters (${short(fromDomain)}).`, fromDomain);
      }
    }

    // ---- display name tricks --------------------------------------------
    const nameEmail = EMAIL_IN_TEXT.exec(fromName)?.[0]?.toLowerCase();
    if (nameEmail && fromAddr && nameEmail !== fromAddr) {
      spoofedIdentity = true;
      add("display_name.other_address", `The sender's name shows ${short(nameEmail)}, but it was really sent from ${short(fromAddr)}.`, nameEmail);
    }

    const exactContact = contacts.find((c) => cleanAddress(c.address) === fromAddr);
    const nName = normName(fromName);
    if (!exactContact && nName) {
      const impersonated = contacts.find((c) => {
        const cn = normName(c.name);
        if (!cn) return false;
        const cReg = registrableDomain(domainOf(cleanAddress(c.address)));
        if (cReg && cReg === fromReg) return false; // same organisation, different mailbox
        return cn === nName || (cn.includes(" ") && containsWord(nName, cn));
      });
      if (impersonated) {
        spoofedIdentity = true;
        add("impersonation.known_contact", `The sender uses the name of your contact ${short(impersonated.name ?? "", 30)}, but from a different address (${short(fromAddr)}).`, cleanAddress(impersonated.address));
      }
    }

    // ---- free-mail sender claiming a brand / role / your organisation ----
    const orgLabels = ownDomains
      .map((d) => registrableDomain(toUnicodeDomain(d)).split(".")[0] ?? "")
      .filter((l) => l.length >= 3);
    const brands = [...BRANDS, ...(opts.brandNames ?? []).map((b) => b.toLowerCase().trim()).filter(Boolean)];
    const claimedBrand = fromName ? [...orgLabels, ...brands].find((b) => containsWord(fromName, b)) : undefined;
    const claimedRole = fromName ? ROLES.find((r) => containsWord(fromName, r)) : undefined;
    if (fromFree && claimedBrand) {
      add("free_mail.brand", `The sender claims to be ${short(titleCase(claimedBrand), 30)} but uses a free personal email account (${short(fromDomain, 30)}).`, claimedBrand);
    } else if (fromFree && claimedRole) {
      add("free_mail.role", `The sender's name says "${short(fromName, 30)}" but it comes from a free personal email account (${short(fromDomain, 30)}).`, claimedRole);
    } else if (!fromFree && fromDomain && !fromIsOwn && !hits.some((h) => h.code === "lookalike.from")) {
      const org = orgLabels.find((l) => containsWord(fromName, l));
      if (org) {
        add("display_name.claims_org", `The sender's name mentions ${short(titleCase(org), 30)}, but the message comes from an outside domain (${short(fromDomain, 30)}).`, org);
      }
    }

    // ---- reply-to --------------------------------------------------------
    for (const r of msg.replyTo ?? []) {
      const rAddr = cleanAddress(r?.address);
      const rDom = domainOf(rAddr);
      if (!rDom || !fromReg) continue;
      const rReg = registrableDomain(rDom);
      if (rReg === fromReg) continue;
      const rFree = isFreeMail(rDom, freeExtra);
      if (rFree && !fromFree) {
        add("reply_to.free_mail", `Replies would go to a personal email account (${short(rAddr)}), not the sender's (${short(fromAddr)}).`, rAddr);
      } else {
        add("reply_to.different_domain", `Replies would go to a different address (${short(rAddr)}) than the sender's (${short(fromAddr)}).`, rAddr);
      }
      if (!rFree) {
        const imitated = lookalikeOf(rDom, candidates);
        if (imitated) add("lookalike.reply_to", `Replies would go to ${short(rAddr)}, which looks like ${short(imitated, 30)} but is a different domain.`, imitated);
      }
    }

    // ---- authentication --------------------------------------------------
    const auth = msg.auth;
    const where = fromDomain || "the sender";
    let authFailing = false;
    if (auth) {
      const { spf, dkim, dmarc } = auth;
      if (isFailing(dmarc)) {
        authFailing = true;
        add("auth.dmarc_fail", `It failed ${short(where, 40)}'s anti-forgery check (DMARC), so it may not really be from them.`, dmarc ?? undefined);
      }
      if (dmarc !== "pass") {
        if (spf === "fail" || spf === "permerror") {
          authFailing = true;
          add("auth.spf_fail", `It was sent from a server that isn't allowed to send email for ${short(where, 40)} (SPF failed).`, spf);
        } else if (spf === "softfail") {
          authFailing = true;
          add("auth.spf_softfail", `It came from a server ${short(where, 40)} doesn't normally use to send email (SPF soft fail).`, spf);
        }
        if (dkim === "fail" || dkim === "permerror" || dkim === "policy") {
          authFailing = true;
          add("auth.dkim_fail", "Its digital signature (DKIM) didn't check out, so it may have been forged or altered.", dkim);
        }
      }
      const absent = (v: Verdict | undefined) => v === "none" || v === null || v === undefined;
      const anyReported = [spf, dkim, dmarc].some((v) => v !== undefined && v !== null);
      if (anyReported && absent(spf) && absent(dkim) && absent(dmarc)) {
        add("auth.unauthenticated", "The sender's identity couldn't be verified: it carries no SPF, DKIM or DMARC authentication.");
      }
      // DMARC pass proves domain ownership only, so it does not offset a disguised domain or name.
      if (dmarc === "pass" && !spoofedIdentity) add("auth.dmarc_pass", "Sender authentication (DMARC) passed.");
    }

    if (exactContact && !authFailing && !spoofedIdentity) add("known_contact", "The sender is in your contacts.");

    // ---- content ---------------------------------------------------------
    const subject = typeof msg.subject === "string" ? msg.subject.replace(EXTERNAL_TAG, "") : "";
    const text = `${subject}\n${typeof msg.snippet === "string" ? msg.snippet : ""}`.toLowerCase();
    if (text.trim()) {
      const urgent = URGENCY.some((r) => r.test(text));
      const payPhrase = PAYMENT_PHRASES.some((r) => r.test(text));
      const credPhrase = CREDENTIAL_PHRASES.some((r) => r.test(text));
      const moneyWord = MONEY_WORDS.some((r) => r.test(text));
      const credWord = CRED_WORDS.some((r) => r.test(text));
      if (payPhrase) {
        add("content.payment_request", urgent
          ? "It urgently asks for a payment or new bank details. Confirm with the sender by phone before paying."
          : "It asks for a payment or new bank details. Confirm with the sender by phone before paying.",
          urgent ? "urgent" : undefined, urgent ? 35 : 25);
      }
      if (credPhrase) {
        add("content.credential_request", urgent
          ? "It urgently asks you to sign in or confirm your account, a common way to steal passwords."
          : "It asks you to sign in or confirm your account, a common way to steal passwords.",
          urgent ? "urgent" : undefined, urgent ? 35 : 25);
      }
      if (!payPhrase && !credPhrase) {
        if (urgent && (moneyWord || credWord)) {
          add("content.urgent_request", "It uses urgent wording to push you into a payment or sign-in.");
        } else if (urgent || moneyWord || credWord) {
          add("content.cue", "It mentions money, urgency or account sign-in.");
        }
      }
    }

    // ---- links -----------------------------------------------------------
    for (const link of Array.isArray(msg.links) ? msg.links : []) {
      if (!link || typeof link.href !== "string") continue;
      const p = parseHref(link.href);
      if (!p || !p.host) continue;
      const host = toUnicodeDomain(p.host.replace(/^\[|\]$/g, ""));
      if (p.userinfo !== undefined && p.userinfo !== "") {
        add("link.userinfo", `A link uses an '@' trick to hide that it really goes to ${short(host)}.`, link.href);
      }
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || p.host.startsWith("[")) {
        add("link.ip_address", `A link goes to a bare IP address (${short(host)}) instead of a website name.`, link.href);
        continue;
      }
      if (/(^|\.)xn--/i.test(p.host)) {
        add("link.punycode", `A link goes to a site with unusual international characters (${short(host)}).`, link.href);
      }
      const shown = typeof link.text === "string" ? domainInText(link.text) : null;
      if (shown) {
        const shownReg = registrableDomain(toUnicodeDomain(shown));
        if (shownReg && shownReg !== registrableDomain(host)) {
          add("link.text_mismatch", `A link shows ${short(shown, 35)} but actually goes to ${short(host, 35)}.`, link.href);
        }
      }
      const imitated = lookalikeOf(host, ownDomains);
      if (imitated) {
        add("link.lookalike", `A link goes to ${short(host, 35)}, which looks like ${short(imitated, 30)} but is a different site.`, link.href);
      }
    }
  } catch {
    // fall through with whatever was collected
  }

  const sum = hits.reduce((s, h) => s + h.weight, 0);
  const score = Math.max(0, Math.min(100, Math.round(sum)));
  const level: RiskLevel = score >= RISK_THRESHOLDS.high ? "high" : score >= RISK_THRESHOLDS.low ? "low" : "none";
  const sorted = [...hits].sort((a, b) => b.weight - a.weight);
  const reasons: string[] = [];
  for (const h of sorted) {
    if (h.weight <= 0 || reasons.length >= 5) continue;
    const r = h.reason.length > 120 ? h.reason.slice(0, 119) + "…" : h.reason;
    if (!reasons.includes(r)) reasons.push(r);
  }
  return {
    level,
    score,
    reasons,
    signals: sorted.map((h) => ({ code: h.code, weight: h.weight, ...(h.detail !== undefined ? { detail: h.detail } : {}) })),
  };
}

function titleCase(s: string): string {
  if (s.length <= 3) return s.toUpperCase();
  return s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}
