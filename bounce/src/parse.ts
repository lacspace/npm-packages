/**
 * parseBounce: RFC 3464 DSN, RFC 5965 ARF, RFC 3834 auto-replies,
 * challenge-response mail and plain-text vendor bounces.
 */

import {
  ADDR_SRC,
  BOUNCE_SUBJECT_RE,
  extractAddress,
  getSubject,
  isAutoReplyMap,
  isBounceMap,
  isBounceSender,
  looksLikeChallenge,
} from "./detect";
import {
  decodeBytes,
  decodeEncodedWords,
  first,
  htmlToText,
  lf,
  parseContentType,
  parseHeaderBlock,
  splitHeadBody,
  splitMessage,
} from "./mime";
import type { HeaderMap, MimePart } from "./mime";
import { categoryFromText, classifyStatus, findBasicCode, findEnhancedStatus, kindFor } from "./status";
import type { BounceCategory } from "./status";

export type BounceKind = "hard" | "soft" | "complaint" | "auto-reply" | "unknown";
export type DsnAction = "failed" | "delayed" | "delivered" | "relayed" | "expanded";

export interface BounceRecipient {
  address: string;
  action?: DsnAction;
  /** Enhanced status code, e.g. "5.1.1" (or a basic code like "550" when that is all there is). */
  status?: string;
  diagnostic?: string;
  remoteMta?: string;
}

export interface BounceReport {
  kind: BounceKind;
  recipients: BounceRecipient[];
  originalMessageId?: string;
  originalSubject?: string;
  reportingMta?: string;
  /** ARF Feedback-Type: abuse, fraud, virus, other, not-spam, … */
  feedbackType?: string;
  userAgent?: string;
  category?: BounceCategory;
  /** 0..1 */
  confidence: number;
  /** Plain-English explanation. */
  reason: string;
}

export interface StructuredMessage {
  headers: string;
  text?: string;
  html?: string;
  parts?: Array<{ contentType: string; body: string }>;
}

export type BounceInput = string | Uint8Array | StructuredMessage;

interface Normalised {
  h: HeaderMap;
  text: string;
  parts: MimePart[];
}

function normalise(input: BounceInput): Normalised | null {
  if (typeof input === "string") {
    const s = splitMessage(input);
    return { h: parseHeaderBlock(s.headers), text: s.text || (s.html ? htmlToText(s.html) : ""), parts: s.parts };
  }
  if (input instanceof Uint8Array) {
    return normalise(decodeBytes(input, "utf-8"));
  }
  if (input && typeof input === "object") {
    const headers = typeof input.headers === "string" ? input.headers : "";
    const text = typeof input.text === "string" ? input.text : "";
    const html = typeof input.html === "string" ? input.html : "";
    const parts: MimePart[] = [];
    if (Array.isArray(input.parts)) {
      for (const p of input.parts) {
        if (p && typeof p.contentType === "string" && typeof p.body === "string") {
          parts.push({ contentType: parseContentType(p.contentType).type, body: p.body });
        }
      }
    }
    return { h: parseHeaderBlock(headers), text: text || (html ? htmlToText(html) : ""), parts };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

function cleanAddress(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const semi = v.indexOf(";");
  const raw = (semi >= 0 && /^\s*[a-z0-9-]+\s*;/i.test(v) ? v.slice(semi + 1) : v).trim();
  return extractAddress(raw) ?? (raw ? raw.replace(/^<|>$/g, "").toLowerCase() : undefined);
}

function stripType(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const t = v.replace(/^\s*[a-z0-9-]+\s*;\s*/i, "").trim();
  return t || undefined;
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

/** Header groups separated by blank lines, each unfolded. */
function fieldGroups(body: string): HeaderMap[] {
  const groups: HeaderMap[] = [];
  const chunks = lf(body).split(/\n[ \t]*\n/);
  for (const c of chunks) {
    if (!c.trim()) continue;
    const m = parseHeaderBlock(c.replace(/^\n+/, ""));
    if (m.size) groups.push(m);
  }
  return groups;
}

interface Embedded {
  messageId?: string;
  subject?: string;
  to?: string;
}

function embeddedFrom(parts: MimePart[], text: string): Embedded {
  for (const p of parts) {
    if (
      p.contentType === "message/rfc822" ||
      p.contentType === "text/rfc822-headers" ||
      p.contentType === "message/global" ||
      p.contentType === "message/global-headers"
    ) {
      const head = splitHeadBody(p.body.replace(/^\s*\n/, "")).head;
      const h = parseHeaderBlock(head);
      if (h.size) {
        return {
          messageId: first(h, "message-id")?.trim(),
          subject: h.has("subject") ? getSubject(h) : undefined,
          to: first(h, "to"),
        };
      }
    }
  }
  // Quoted original headers inside a text bounce.
  const t = lf(text);
  const mid = /^[ \t>]*Message-I[Dd]:[ \t]*(<[^>\n]+>|\S+)/m.exec(t);
  const subj = /^[ \t>]*Subject:[ \t]*(.+(?:\n[ \t]+.+)*)/m.exec(t);
  const to = /^[ \t>]*To:[ \t]*(.+)/m.exec(t);
  return {
    messageId: mid?.[1]?.trim(),
    subject: subj?.[1] ? decodeEncodedWords(subj[1].replace(/\n[ \t]+/g, " ").trim()) : undefined,
    to: to?.[1]?.trim(),
  };
}

const ORIGINAL_MARKER =
  /^[ \t]*(-{2,}\s*(This is a copy of|Original message|Below this line is a copy|Forwarded message|Original Message)|(The )?original message (was|follows|headers? (follow|are))|Original message headers:|-{2,}\s*The header of the original message|Received: (from|by) )/im;

function noticePart(text: string): string {
  const t = lf(text);
  const m = ORIGINAL_MARKER.exec(t);
  return m ? t.slice(0, m.index) : t;
}

function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function describe(recips: BounceRecipient[]): string {
  if (!recips.length) return "the recipient";
  const list = recips.slice(0, 3).map((r) => r.address);
  const more = recips.length > 3 ? ` and ${recips.length - 3} more` : "";
  return list.join(", ") + more;
}

function reasonFor(kind: BounceKind, category: BounceCategory | undefined, recips: BounceRecipient[], delayed: boolean): string {
  const who = describe(recips);
  const status = recips.find((r) => r.status)?.status;
  const code = status ? ` (status ${status})` : "";
  if (kind === "unknown" && category !== "challenge") {
    return "This looks like a bounce, but the failed address or the reason could not be read. Review it by hand.";
  }
  switch (category) {
    case "mailbox_unknown":
      return `The mailbox ${who} does not exist or has been disabled${code}. Stop sending to this address.`;
    case "domain_unknown":
      return `The domain of ${who} does not exist or has no mail server${code}. Stop sending to this address.`;
    case "mailbox_full":
      return `The mailbox ${who} is full${code}. The address is valid, so try again later.`;
    case "blocked_spam":
      return `The receiving server blocked the message as spam or because of the sender's reputation${code}. The address ${who} is probably fine; the sender is the problem.`;
    case "blocked_policy":
      return `The receiving server refused the message because of a policy rule${code}. The address ${who} may still be valid.`;
    case "auth_failed":
      return `The message failed sender authentication (SPF, DKIM or DMARC)${code}. Fix the sending domain's setup; the address ${who} is probably fine.`;
    case "message_too_large":
      return `The message was too large for the server of ${who}${code}. Send a smaller message.`;
    case "rate_limited":
      return `The receiving server is limiting how fast it accepts mail${code}. Slow down and retry ${who} later.`;
    case "temporary":
      return delayed
        ? `Delivery to ${who} is delayed${code}. The server is still retrying, so no action is needed yet.`
        : `Delivery to ${who} failed for a temporary reason${code}. Retry later.`;
    case "challenge":
      return "The recipient uses a challenge-response filter. It asks the sender to verify themselves before the message is delivered. The address exists but a person must act.";
    default:
      return kind === "hard"
        ? `Delivery to ${who} failed permanently for an unclassified reason${code}. Stop sending to this address.`
        : `Delivery to ${who} failed for an unclassified reason${code}.`;
  }
}

/** Pick the most severe recipient result: hard > soft. */
function aggregate(recips: BounceRecipient[]): { kind: "hard" | "soft"; category: BounceCategory; delayed: boolean } {
  let best: { kind: "hard" | "soft"; category: BounceCategory } | null = null;
  let allDelayed = recips.length > 0;
  for (const r of recips) {
    const delayed = r.action === "delayed";
    if (!delayed) allDelayed = false;
    const c = classifyStatus(r.status ?? "", r.diagnostic);
    const kind: "hard" | "soft" = delayed ? "soft" : c.kind;
    const category = delayed && (c.category === "mailbox_unknown" || c.category === "domain_unknown" || c.category === "other") ? "temporary" : c.category;
    if (!best || (best.kind === "soft" && kind === "hard")) best = { kind, category };
  }
  return { ...(best ?? { kind: "soft", category: "other" }), delayed: allDelayed };
}

/* ------------------------------------------------------------------ */
/* ARF complaints                                                     */
/* ------------------------------------------------------------------ */

function parseArf(n: Normalised): BounceReport | null {
  const ct = parseContentType(first(n.h, "content-type"));
  let fr = n.parts.find((p) => p.contentType === "message/feedback-report");
  let body = fr?.body;
  if (!body && ct.params["report-type"]?.toLowerCase() === "feedback-report" && /^Feedback-Type:/im.test(n.text)) body = n.text;
  if (!body && /^Feedback-Type:\s*\S+/im.test(n.text) && /^(User-Agent|Version):/im.test(n.text) && !fr) {
    body = n.text;
  }
  if (!body) return null;
  const h = new Map<string, string[]>();
  for (const g of fieldGroups(body)) for (const [k, v] of g) h.set(k, [...(h.get(k) ?? []), ...v]);
  const feedbackType = first(h, "feedback-type")?.trim().toLowerCase();
  if (!feedbackType && !fr) return null;
  const emb = embeddedFrom(n.parts, n.text);
  const addrs: string[] = [];
  for (const v of h.get("original-rcpt-to") ?? []) {
    const a = cleanAddress(v);
    if (a) addrs.push(a);
  }
  if (!addrs.length && emb.to) {
    for (const m of emb.to.match(new RegExp(ADDR_SRC, "g")) ?? []) addrs.push(m.toLowerCase());
  }
  const recipients = unique(addrs).map((address) => ({ address }));
  const ft = feedbackType ?? "abuse";
  const what = ft === "abuse" ? "spam" : ft === "not-spam" ? "not spam" : ft;
  const report: BounceReport = {
    kind: "complaint",
    recipients,
    feedbackType: ft,
    confidence: recipients.length ? 0.98 : 0.85,
    reason:
      ft === "not-spam"
        ? `The recipient ${describe(recipients)} marked the message as not spam. No action is needed.`
        : `The recipient ${describe(recipients)} reported the message as ${what}. Stop sending to this address.`,
  };
  const ua = first(h, "user-agent")?.trim();
  if (ua) report.userAgent = ua;
  const rm = stripType(first(h, "reporting-mta"));
  if (rm) report.reportingMta = rm;
  if (emb.messageId) report.originalMessageId = emb.messageId;
  if (emb.subject) report.originalSubject = emb.subject;
  return report;
}

/* ------------------------------------------------------------------ */
/* RFC 3464 DSN                                                       */
/* ------------------------------------------------------------------ */

const ACTIONS = new Set<DsnAction>(["failed", "delayed", "delivered", "relayed", "expanded"]);

function parseDsn(n: Normalised): BounceReport | null {
  const part = n.parts.find((p) => p.contentType === "message/delivery-status" || p.contentType === "message/global-delivery-status");
  let body = part?.body;
  if (!body && /^Final-Recipient:/im.test(n.text) && /^(Action|Status):/im.test(n.text)) {
    const t = lf(n.text);
    const start = t.search(/^(Reporting-MTA|Original-Envelope-Id|Final-Recipient):/im);
    body = start >= 0 ? t.slice(start) : t;
  }
  if (!body) return null;
  const groups = fieldGroups(body);
  let reportingMta: string | undefined;
  const recipients: BounceRecipient[] = [];
  for (const g of groups) {
    if (g.has("reporting-mta") && !reportingMta) reportingMta = stripType(first(g, "reporting-mta"));
    if (!g.has("final-recipient") && !g.has("original-recipient")) continue;
    const address = cleanAddress(first(g, "final-recipient")) ?? cleanAddress(first(g, "original-recipient"));
    if (!address) continue;
    const r: BounceRecipient = { address };
    const action = (first(g, "action") ?? "").trim().toLowerCase().split(/[\s(]/)[0] as DsnAction;
    if (ACTIONS.has(action)) r.action = action;
    const statusRaw = first(g, "status")?.trim();
    const diag = stripType(first(g, "diagnostic-code"));
    const status = findEnhancedStatus(statusRaw) ?? findEnhancedStatus(diag) ?? findBasicCode(" " + (statusRaw ?? ""));
    if (status) r.status = status;
    if (diag) r.diagnostic = diag;
    const remote = stripType(first(g, "remote-mta"));
    if (remote) r.remoteMta = remote;
    recipients.push(r);
  }
  const emb = embeddedFrom(n.parts, part ? "" : n.text);
  const base: Partial<BounceReport> = {};
  if (reportingMta) base.reportingMta = reportingMta;
  if (emb.messageId) base.originalMessageId = emb.messageId;
  if (emb.subject) base.originalSubject = emb.subject;
  if (!base.originalMessageId) {
    const irt = first(n.h, "in-reply-to") ?? first(n.h, "references");
    const m = irt ? /<[^>]+>/.exec(irt) : null;
    if (m) base.originalMessageId = m[0];
  }

  if (!recipients.length) {
    return null;
  }
  const failing = recipients.filter((r) => r.action === "failed" || r.action === "delayed" || r.action === undefined);
  if (!failing.length) return null; // success-only DSN (delivered / relayed / expanded)
  const agg = aggregate(failing);
  const withStatus = failing.some((r) => r.status);
  const confidence = withStatus ? (findEnhancedStatus(failing.find((r) => r.status)?.status) ? 0.95 : 0.85) : 0.7;
  return {
    kind: agg.kind,
    recipients,
    ...base,
    category: agg.category,
    confidence,
    reason: reasonFor(agg.kind, agg.category, failing, agg.delayed),
  };
}

/* ------------------------------------------------------------------ */
/* Plain-text vendor bounces                                          */
/* ------------------------------------------------------------------ */

const DELAY_SUBJECT_RE = /\(delay\)|delayed mail|delivery delayed|warning: (message|could not send)|still being retried|delivery status notification \(delay\)|not yet been delivered/i;
const DELAY_TEXT_RE =
  /has not (yet )?been delivered|will (continue to )?(retry|try)|will keep trying|still trying|is delayed|been delayed|delivery is delayed|no action is required on your part|not been able to deliver.{0,80}(yet|retry)/i;

/** SMTP response lines in the notice part. */
function diagnosticLine(notice: string): { status?: string; diagnostic?: string } {
  const lines = notice.split("\n");
  // Prefer a line carrying an enhanced code, then a basic SMTP code.
  const pick = (test: (l: string) => boolean): number => lines.findIndex(test);
  let i = pick((l) => !!findEnhancedStatus(l) && !/^\s*(Status|Action):/i.test(l));
  if (i < 0) i = pick((l) => !!findBasicCode(" " + l));
  if (i < 0) return {};
  let line = (lines[i] ?? "").trim();
  // Join short continuation lines (Exim, Gmail wrap diagnostics).
  for (let j = i + 1; j < lines.length && j < i + 4; j++) {
    const next = (lines[j] ?? "").trim();
    if (!next || /^[-=]{3,}/.test(next) || /^\S+@\S+\s*$/.test(next)) break;
    if (/^(\d{3}[ -]|#?\d\.\d)/.test(next) || /^\s/.test(lines[j] ?? "")) line += " " + next;
    else break;
  }
  line = line.replace(/^.*?(Remote Server returned|Remote server returned)\s*/i, "").replace(/^['"]|['"]$/g, "");
  const status = findEnhancedStatus(line) ?? findBasicCode(" " + line);
  return { status, diagnostic: line.slice(0, 500) };
}

const RCPT_PATTERNS: RegExp[] = [
  new RegExp(`^[ \\t]*<(${ADDR_SRC})>[ \\t]*:`, "gm"), // Postfix, qmail
  new RegExp(
    `(?:delivered to|message to|delivery to(?: the following recipients?)?|deliver(?:y|ed)? to|could not be delivered to|couldn't be delivered to|undeliverable to|invalid address|failed recipients?|rcpt to|original-recipient|final-recipient|recipient address|address|recipient)[:\\s]*(?:rfc822;\\s*)?<?(${ADDR_SRC})>?`,
    "gi",
  ),
  new RegExp(`^[ \\t]*<?(${ADDR_SRC})>?[ \\t]*:?[ \\t]*$`, "gm"), // address alone on a line (Exim, Outlook, Zoho)
  new RegExp(`^[ \\t]*<?(${ADDR_SRC})>?[ \\t]*[,;]`, "gm"), // "a@b, ERROR CODE: 550" (Zoho)
  new RegExp(`^[ \\t]*<?(${ADDR_SRC})>?[ \\t]*\\n[ \\t]+(?:host|SMTP error|mailbox|unrouteable|retry)`, "gim"),
];

function textRecipients(n: Normalised, notice: string): { addrs: string[]; strong: boolean } {
  const exclude = new Set<string>();
  for (const name of ["to", "from", "cc", "reply-to", "delivered-to", "return-path"]) {
    for (const v of n.h.get(name) ?? []) for (const m of v.match(new RegExp(ADDR_SRC, "g")) ?? []) exclude.add(m.toLowerCase());
  }
  const ok = (a: string) => !exclude.has(a) && !isBounceSender(a);
  const found: string[] = [];
  for (const v of n.h.get("x-failed-recipients") ?? []) {
    for (const m of v.match(new RegExp(ADDR_SRC, "g")) ?? []) found.push(m.toLowerCase());
  }
  for (const re of RCPT_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(notice))) {
      const a = (m[1] ?? "").toLowerCase();
      if (a && ok(a)) found.push(a);
    }
  }
  if (found.length) return { addrs: unique(found), strong: true };
  // Fallback: any address in the notice that is not the sender or a daemon.
  const loose = (notice.match(new RegExp(ADDR_SRC, "g")) ?? []).map((a) => a.toLowerCase()).filter(ok);
  return { addrs: unique(loose), strong: false };
}

function parseTextBounce(n: Normalised): BounceReport {
  const subject = getSubject(n.h);
  const notice = noticePart(n.text);
  const delayed = DELAY_SUBJECT_RE.test(subject) || DELAY_TEXT_RE.test(notice);
  const { addrs, strong } = textRecipients(n, notice);
  const { status, diagnostic } = diagnosticLine(notice);
  // Classify from the SMTP line; otherwise from the notice wording.
  let category: BounceCategory | undefined;
  let kind: "hard" | "soft" | undefined;
  if (status || diagnostic) {
    const c = classifyStatus(status ?? "", diagnostic);
    category = c.category;
    kind = c.kind;
  }
  if (!category || category === "other") {
    const t = categoryFromText(`${subject}\n${notice}`.slice(0, 4000));
    if (t && (!category || (t !== "temporary" && t !== "blocked_policy"))) {
      category = t;
      kind = kindFor(status?.charAt(0), t);
    }
  }
  if (delayed) {
    kind = "soft";
    if (!category || category === "mailbox_unknown" || category === "domain_unknown" || category === "other") category = "temporary";
  }
  const emb = embeddedFrom(n.parts, n.text);
  const action: DsnAction = delayed ? "delayed" : "failed";
  const recipients: BounceRecipient[] = addrs.map((address) => {
    const r: BounceRecipient = { address, action };
    if (status) r.status = status;
    if (diagnostic) r.diagnostic = diagnostic;
    return r;
  });
  const base: Partial<BounceReport> = {};
  if (emb.messageId) base.originalMessageId = emb.messageId;
  if (emb.subject) base.originalSubject = emb.subject;
  if (!base.originalMessageId) {
    const irt = first(n.h, "in-reply-to") ?? first(n.h, "references");
    const m = irt ? /<[^>]+>/.exec(irt) : null;
    if (m) base.originalMessageId = m[0];
  }
  if (!recipients.length || !category || !kind) {
    return {
      kind: "unknown",
      recipients,
      ...base,
      category: category ?? "other",
      confidence: 0.3,
      reason: reasonFor("unknown", category, recipients, delayed),
    };
  }
  let confidence = 0.6;
  if (strong) confidence += 0.1;
  if (status && findEnhancedStatus(status)) confidence += 0.15;
  else if (status) confidence += 0.1;
  if (diagnostic && categoryFromText(diagnostic)) confidence += 0.05;
  return {
    kind,
    recipients,
    ...base,
    category,
    confidence: Math.min(0.9, Math.round(confidence * 100) / 100),
    reason: reasonFor(kind, category, recipients, delayed),
  };
}

/* ------------------------------------------------------------------ */
/* Auto-replies and challenges                                        */
/* ------------------------------------------------------------------ */

function originalFromHeaders(n: Normalised): Partial<BounceReport> {
  const out: Partial<BounceReport> = {};
  const irt = first(n.h, "in-reply-to") ?? first(n.h, "references");
  const m = irt ? /<[^>]+>/.exec(irt) : null;
  if (m) out.originalMessageId = m[0];
  const subject = getSubject(n.h);
  const stripped = subject.replace(/^\s*((automatic reply|auto(matic)?[- ]?reply|auto[- ]?response|autoreply|out of (the )?office( reply)?|ooo|re|aw|fw|fwd)\s*:\s*)+/i, "").trim();
  if (stripped && stripped !== subject) out.originalSubject = stripped;
  return out;
}

function fromRecipient(n: Normalised): BounceRecipient[] {
  const a = extractAddress(first(n.h, "from") ?? first(n.h, "sender") ?? first(n.h, "reply-to"));
  return a && a.includes("@") ? [{ address: a }] : [];
}

/* ------------------------------------------------------------------ */
/* entry point                                                        */
/* ------------------------------------------------------------------ */

/**
 * Classify a bounce, spam complaint or auto-reply. Returns null when the
 * message is clearly none of these. Never throws.
 */
export function parseBounce(input: BounceInput): BounceReport | null {
  try {
    const n = normalise(input);
    if (!n) return null;
    if (!n.h.size && !n.text && !n.parts.length) return null;

    const arf = parseArf(n);
    if (arf) return arf;

    const dsn = parseDsn(n);
    if (dsn) return dsn;

    const bounceHeaders = isBounceMap(n.h);
    const subject = getSubject(n.h);
    const hasDsnPart = n.parts.some((p) => p.contentType === "message/delivery-status" || p.contentType === "message/global-delivery-status");

    if (!bounceHeaders && looksLikeChallenge(n.h, n.text)) {
      const recipients = fromRecipient(n);
      return {
        kind: "unknown",
        recipients,
        ...originalFromHeaders(n),
        category: "challenge",
        confidence: 0.7,
        reason: reasonFor("unknown", "challenge", recipients, false),
      };
    }

    const autoReply = isAutoReplyMap(n.h);
    const bounceSubject = BOUNCE_SUBJECT_RE.test(subject);
    const isBounceLike = bounceHeaders || hasDsnPart || (bounceSubject && !autoReply && isBounceSender(first(n.h, "from") ?? ""));
    if (isBounceLike) {
      // A success-only DSN that parseDsn rejected.
      if (hasDsnPart) {
        const part = n.parts.find((p) => p.contentType === "message/delivery-status" || p.contentType === "message/global-delivery-status");
        if (part && /^Action:\s*(delivered|relayed|expanded)/im.test(part.body) && !/^Action:\s*(failed|delayed)/im.test(part.body)) return null;
      }
      return parseTextBounce(n);
    }

    if (autoReply) {
      const recipients = fromRecipient(n);
      const strongHeader =
        n.h.has("auto-submitted") ||
        n.h.has("x-autoreply") ||
        n.h.has("x-autorespond") ||
        n.h.has("x-ms-exchange-inbox-rules-loop") ||
        /auto[_-]reply/i.test(first(n.h, "precedence") ?? "");
      return {
        kind: "auto-reply",
        recipients,
        ...originalFromHeaders(n),
        confidence: strongHeader ? 0.9 : 0.7,
        reason: `Automatic reply (for example an out-of-office notice) from ${describe(recipients)}. The address is valid, so no action is needed.`,
      };
    }

    // Some text bounces arrive without daemon headers (forwarded or rewritten).
    if (bounceSubject && /mail delivery|delivery (status|failure)|could not be delivered|couldn't be delivered|permanent (error|failure)|returned to sender/i.test(noticePart(n.text))) {
      return parseTextBounce(n);
    }
    return null;
  } catch {
    return null;
  }
}
