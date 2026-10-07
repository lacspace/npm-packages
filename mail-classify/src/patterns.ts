/**
 * The patterns the classifier uses. Each one is exported so you can read it,
 * reuse it, or replace it through `classify(input, { patterns: { … } })`.
 */

export type Category =
  | "team"
  | "clients"
  | "personal"
  | "finance"
  | "calendar"
  | "newsletters"
  | "notifications"
  | "recruiting"
  | "social"
  | "promotions";

export type Priority = "high" | "normal" | "low";

/** Every category, in display order. */
export const CATEGORIES: readonly Category[] = [
  "team",
  "clients",
  "personal",
  "finance",
  "calendar",
  "newsletters",
  "notifications",
  "recruiting",
  "social",
  "promotions",
];

/** Categories that make up a "Focused" view: mail from people that usually needs you. */
export const FOCUSED: readonly Category[] = ["team", "clients", "personal", "finance", "calendar", "recruiting"];

/** Consumer mailbox domains (sender domain). A match means "personal". */
export const FREE_MAIL =
  /(^|\.)(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|me|mac|aol|proton|protonmail|pm|gmx|zoho|yandex|mail|rediffmail)\.(com|net|org|me|co\.uk|co\.in|in|ch|ru|de)$/i;

/** Automated sender local parts (tested against the full lowercased address). */
export const AUTOMATED =
  /^(no-?reply|do-?not-?reply|noreply|mailer-daemon|postmaster|bounce|bounces|notification|notifications|alert|alerts|system|robot|bot|automated|auto|daemon|updates?|info|news|digest|support|help|team|hello|contact|billing|accounts?|security)(\+|@|[._-])/i;

/** Extra no-reply check on the local part only. */
export const NOREPLY_LOCAL = /noreply|no-reply|donotreply/;

/** Social networks and chat apps (sender domain). Labels are matched on a domain boundary. */
export const SOCIAL_DOM =
  /(^|\.)(linkedin|facebook|facebookmail|instagram|twitter|tiktok|youtube|pinterest|reddit|threads|snapchat|whatsapp|telegram|discord|slack)\.|(^|\.)x\.com$/i;

/** Services that send automated notifications (sender domain). Labels are matched on a domain boundary. */
export const NOTIF_DOM =
  /(^|\.)(github|gitlab|bitbucket|vercel|netlify|aws|amazonaws|google|googleapis|microsoft|apple|atlassian|jira|trello|asana|notion|figma|zoom|dropbox|hostinger|godaddy|namecheap|cloudflare|stripe|paypal|razorpay|esewa|khalti|twilio|sendgrid|mailgun|postmark|digitalocean|heroku|npmjs|docker)\./i;

/** Money words. Tested against the subject (and the snippet, with FINANCE_SNIPPET_CONFIRM). */
export const FINANCE =
  /\b(invoice|receipt|payment|paid|payout|refund|billing|bill|statement|balance|transaction|subscription renew|renewal|quotation|quote|estimate|purchase order|\bPO\b|tax|GST|VAT|salary|payroll|bank|remittance|wire|due (date|on)|overdue|amount|USD|EUR|INR|NPR|AED|Rs\.?)\b/i;
/** A snippet only counts as finance when it also has one of these stronger words. */
export const FINANCE_SNIPPET_CONFIRM = /invoice|receipt|payment|paid|refund|billing/i;

/** Calendar words in a subject. Only used late in the cascade, for mail from people. */
export const CALENDAR =
  /\b(invitation|invite|calendar|meeting|call|appointment|schedule|rescheduled|reminder: .*(meeting|call)|webinar|event|zoom|google meet|teams meeting|RSVP|accepted:|declined:|tentative:)\b/i;
/** Subjects that calendar systems send (checked first). */
export const CALENDAR_SUBJECT = /^(invitation|updated invitation|accepted|declined|tentative|canceled|cancelled)\b/i;
/** An .ics attachment mentioned in the subject or snippet. */
export const CALENDAR_ICS = /\.ics\b/i;

/** Hiring words. Tested against the subject (and the snippet, with RECRUIT_SNIPPET_CONFIRM). */
export const RECRUIT =
  /\b(application|applying|apply|candidate|resume|résumé|\bCV\b|cover letter|job|position|vacancy|opening|interview|internship|hiring|recruit(er|ing|ment)|portfolio)\b/i;
export const RECRUIT_SNIPPET_CONFIRM = /resume|cv|application|interview/i;

/** Newsletter / digest words (subject + snippet). */
export const NEWSLETTER =
  /\b(newsletter|weekly|monthly|digest|roundup|edition|issue #?\d+|what's new|this week in|unsubscribe|view (this )?(email )?in (your )?browser)\b/i;

/** Marketing words (subject only). */
export const PROMO =
  /\b(sale|% off|percent off|discount|deal|offer|coupon|promo|limited time|last chance|black friday|cyber monday|free shipping|buy now|shop now|exclusive|flash sale|save \$|save up to|ends (tonight|today|soon))\b/i;

/** Urgency words (subject + snippet). Raise priority. */
export const URGENT =
  /\b(urgent|asap|immediately|today|deadline|by (eod|end of day|tomorrow|friday|monday)|action (needed|required)|important|final notice|overdue|time.?sensitive|please (confirm|approve|review|respond))\b/i;

/** A question mark in the subject or snippet raises priority by one. */
export const QUESTION = /\?/;

/** Every overridable pattern, keyed by its option name. */
export interface ClassifyPatterns {
  freeMail: RegExp;
  automated: RegExp;
  noreplyLocal: RegExp;
  socialDomain: RegExp;
  notificationDomain: RegExp;
  finance: RegExp;
  financeSnippetConfirm: RegExp;
  calendar: RegExp;
  calendarSubject: RegExp;
  calendarIcs: RegExp;
  recruit: RegExp;
  recruitSnippetConfirm: RegExp;
  newsletter: RegExp;
  promo: RegExp;
  urgent: RegExp;
  question: RegExp;
}

export const DEFAULT_PATTERNS: Readonly<ClassifyPatterns> = Object.freeze({
  freeMail: FREE_MAIL,
  automated: AUTOMATED,
  noreplyLocal: NOREPLY_LOCAL,
  socialDomain: SOCIAL_DOM,
  notificationDomain: NOTIF_DOM,
  finance: FINANCE,
  financeSnippetConfirm: FINANCE_SNIPPET_CONFIRM,
  calendar: CALENDAR,
  calendarSubject: CALENDAR_SUBJECT,
  calendarIcs: CALENDAR_ICS,
  recruit: RECRUIT,
  recruitSnippetConfirm: RECRUIT_SNIPPET_CONFIRM,
  newsletter: NEWSLETTER,
  promo: PROMO,
  urgent: URGENT,
  question: QUESTION,
});

export interface CategoryMeta {
  label: string;
  color: string;
  hint: string;
}

/** Display labels, colours and one-line hints for each category. */
export const CATEGORY_META: Readonly<Record<Category, CategoryMeta>> = Object.freeze({
  team: { label: "Team", color: "#7C3AED", hint: "People on your own domain" },
  clients: { label: "Clients", color: "#F97316", hint: "Businesses and partners writing to you" },
  personal: { label: "Personal", color: "#0BB9D9", hint: "People on Gmail, Yahoo, iCloud and similar" },
  finance: { label: "Finance", color: "#16a34a", hint: "Invoices, receipts, payments, quotes" },
  calendar: { label: "Calendar", color: "#3B82F6", hint: "Invitations and meeting updates" },
  recruiting: { label: "Recruiting", color: "#db2777", hint: "Applications, CVs, interviews" },
  newsletters: { label: "Newsletters", color: "#ca8a04", hint: "Mailing lists and digests" },
  notifications: { label: "Notifications", color: "#64748b", hint: "Automated mail from services" },
  social: { label: "Social", color: "#9333ea", hint: "LinkedIn, Facebook, Instagram…" },
  promotions: { label: "Promotions", color: "#ea580c", hint: "Offers, sales, marketing" },
});

/** Merge partial overrides into CATEGORY_META. Returns a new object; the default is never mutated. */
export function categoryMeta(
  overrides?: Partial<Record<Category, Partial<CategoryMeta>>> | null,
): Record<Category, CategoryMeta> {
  const out = {} as Record<Category, CategoryMeta>;
  for (const c of CATEGORIES) {
    const o = overrides && typeof overrides === "object" ? overrides[c] : undefined;
    out[c] = { ...CATEGORY_META[c], ...(o && typeof o === "object" ? stripUndefined(o) : {}) };
  }
  return out;
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  const r: Partial<T> = {};
  for (const k of Object.keys(o) as Array<keyof T>) if (o[k] !== undefined) r[k] = o[k];
  return r;
}
