/** Reply / forward helpers for threading. */

import type { ParsedMail } from "./types";

const REPLY_PREFIX = /^\s*(?:(?:re|aw|sv|antw|vs|ref|odp)(?:\[\d+\]|\(\d+\))?\s*[:：]\s*)+/i;
const FWD_PREFIX = /^\s*(?:(?:fwd?|wg|tr|rv|enc)\s*[:：]\s*)+/i;

/** "Re: subject" without stacking prefixes ("Re: Re:", "RE[2]:", "Aw:" …). */
export function replySubject(subject: string): string {
  const base = (subject ?? "").replace(REPLY_PREFIX, "").trim();
  return `Re: ${base}`;
}

/** "Fwd: subject" without stacking prefixes. Accepts a subject or a ParsedMail. */
export function forwardSubject(subject: string | Pick<ParsedMail, "subject">): string {
  const s = typeof subject === "string" ? subject : subject.subject;
  const base = (s ?? "").replace(FWD_PREFIX, "").trim();
  return `Fwd: ${base}`;
}

/**
 * Threading headers for a reply (RFC 5322 §3.6.4): In-Reply-To = the
 * original Message-ID; References = original References (or its In-Reply-To)
 * + its Message-ID. Feed straight into buildMime.
 */
export function replyHeaders(original: Pick<ParsedMail, "messageId" | "references" | "inReplyTo" | "subject">): {
  inReplyTo?: string;
  references: string[];
  subject: string;
} {
  const refs = original.references?.length ? [...original.references] : original.inReplyTo ? [original.inReplyTo] : [];
  if (original.messageId && !refs.includes(original.messageId)) refs.push(original.messageId);
  const out: { inReplyTo?: string; references: string[]; subject: string } = { references: refs, subject: replySubject(original.subject) };
  if (original.messageId) out.inReplyTo = original.messageId;
  return out;
}
