import { buildLookup, DEFAULT_GROUPS, normalizeKey, resolveKey } from "./aliases";
import type { Row } from "./csv";
import { compileTemplate, renderCompiled, type CompiledTemplate } from "./template";

export type Address = { name?: string; address: string };

export type SkipCode =
  | "missing_email"
  | "invalid_email"
  | "duplicate"
  | "suppressed"
  | "missing_variable"
  | "max_reached";

export interface MergeInput {
  subject: string;
  html?: string;
  text?: string;
}

export interface MergeOptions {
  /** Column holding the address. Detected through the email aliases when omitted. */
  emailField?: string;
  /** Same as emailField. */
  emailColumn?: string;
  /** Skip repeated addresses, ignoring case. Default true. */
  dedupe?: boolean;
  /** Check address syntax. Default true. */
  validateEmail?: boolean;
  /** Skip rows that leave a used variable empty with no fallback. Default false. */
  requireVars?: boolean;
  /** Addresses or "@domain" entries never to send to. */
  suppress?: Iterable<string>;
  /** Extra variables for every row (or per row). They override row values. */
  extra?: Record<string, string> | ((row: Row) => Record<string, string>);
  /** Stop producing messages after this many. */
  max?: number;
}

export interface MergedMessage {
  to: Address;
  subject: string;
  html?: string;
  text?: string;
  row: Row;
  rowIndex: number;
  warnings: string[];
}

export interface MergeReport {
  total: number;
  ok: number;
  skipped: Array<{ row: number; reason: string; code: SkipCode }>;
  missingVars: Record<string, number>;
}

export interface MergeResult {
  messages: MergedMessage[];
  report: MergeReport;
}

export const ROLE_LOCAL_PARTS: readonly string[] = ["info", "admin", "noreply", "no-reply", "support", "sales"];

const LOCAL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const TLD_RE = /^(?:[A-Za-z]{2,63}|xn--[A-Za-z0-9-]{1,59})$/;

/** Practical syntax check for an ASCII email address (no quoted local parts, no IP literals). */
export function isValidEmail(address: string): boolean {
  const a = String(address ?? "").trim();
  if (a.length > 254) return false;
  const at = a.lastIndexOf("@");
  if (at < 1 || a.indexOf("@") !== at) return false;
  const local = a.slice(0, at);
  const domain = a.slice(at + 1);
  if (local.length > 64 || !LOCAL_RE.test(local)) return false;
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  if (!labels.every((l) => LABEL_RE.test(l))) return false;
  return TLD_RE.test(labels[labels.length - 1]!);
}

/** Split "Name <addr>" or "mailto:addr" into parts. */
function splitAddress(cell: string): { address: string; name?: string } {
  let s = cell.trim();
  const m = /^(.*?)<([^<>]*)>\s*$/.exec(s);
  let name: string | undefined;
  if (m) {
    name = m[1]!.trim().replace(/^"(.*)"$/, "$1").trim() || undefined;
    s = m[2]!.trim();
  }
  s = s.replace(/^mailto:/i, "").trim();
  return name ? { address: s, name } : { address: s };
}

const oneLine = (s: string): string => s.replace(/[\r\n]+/g, " ").replace(/[ \t]{2,}/g, " ").trim();

function findEmailColumn(rows: Row[], wanted?: string): string | undefined {
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const r of rows)
    for (const k of Object.keys(r))
      if (!seen.has(k)) {
        seen.add(k);
        cols.push(k);
      }
  if (wanted) {
    return cols.find((c) => c === wanted) ?? cols.find((c) => normalizeKey(c) === normalizeKey(wanted));
  }
  const group = DEFAULT_GROUPS.find((g) => g.canonical === "email")!;
  for (const k of group.keys) {
    const hit = cols.find((c) => normalizeKey(c) === k);
    if (hit) return hit;
  }
  return undefined;
}

function displayName(lookup: Map<string, string>): string | undefined {
  const full = (resolveKey(lookup, "name") ?? "").trim();
  if (full) return oneLine(full);
  const first = (resolveKey(lookup, "firstName") ?? "").trim();
  const last = (resolveKey(lookup, "lastName") ?? "").trim();
  const joined = oneLine(`${first} ${last}`);
  return joined || undefined;
}

/**
 * Turn rows plus a subject/html/text template into one message per recipient,
 * with a report of everything skipped. Nothing is sent.
 */
export function merge(input: MergeInput, rows: Row[], opts: MergeOptions = {}): MergeResult {
  const dedupe = opts.dedupe !== false;
  const validate = opts.validateEmail !== false;
  const max = typeof opts.max === "number" && opts.max >= 0 ? Math.floor(opts.max) : Infinity;
  const list = Array.isArray(rows) ? rows : [];

  const tSubject = compileTemplate(input.subject ?? "");
  const tHtml: CompiledTemplate | undefined = input.html !== undefined ? compileTemplate(input.html) : undefined;
  const tText: CompiledTemplate | undefined = input.text !== undefined ? compileTemplate(input.text) : undefined;

  const suppressAddr = new Set<string>();
  const suppressDomain = new Set<string>();
  for (const s of opts.suppress ?? []) {
    const v = String(s).trim().toLowerCase();
    if (!v) continue;
    if (v.startsWith("@")) suppressDomain.add(v.slice(1));
    else suppressAddr.add(v);
  }

  const emailCol = findEmailColumn(list, opts.emailField ?? opts.emailColumn);
  const messages: MergedMessage[] = [];
  const skipped: MergeReport["skipped"] = [];
  const missingVars: Record<string, number> = {};
  const sent = new Set<string>();

  list.forEach((row, rowIndex) => {
    const skip = (code: SkipCode, reason: string): void => {
      skipped.push({ row: rowIndex, reason, code });
    };
    const cell = emailCol !== undefined ? String(row?.[emailCol] ?? "") : "";
    if (!cell.trim()) return skip("missing_email", emailCol ? `Empty "${emailCol}" column` : "No email column found");
    const parsed = splitAddress(cell);
    const address = parsed.address;
    const lower = address.toLowerCase();
    if (!address || (validate && !isValidEmail(address))) return skip("invalid_email", `Invalid email address "${oneLine(cell)}"`);
    const domain = lower.slice(lower.lastIndexOf("@") + 1);
    if (suppressAddr.has(lower) || suppressDomain.has(domain)) return skip("suppressed", `${address} is on the suppression list`);
    if (dedupe && sent.has(lower)) return skip("duplicate", `${address} already appears in an earlier row`);

    const extra = typeof opts.extra === "function" ? opts.extra(row) : opts.extra;
    const lookup = buildLookup(row, extra);

    const missing: string[] = [];
    const subject = oneLine(renderCompiled(tSubject, lookup, { escape: false }, missing));
    const html = tHtml ? renderCompiled(tHtml, lookup, { escape: "html" }, missing) : undefined;
    const text = tText ? renderCompiled(tText, lookup, { escape: false }, missing) : undefined;

    const uniqueMissing: string[] = [];
    const seenMissing = new Set<string>();
    for (const m of missing) {
      const k = normalizeKey(m);
      if (seenMissing.has(k)) continue;
      seenMissing.add(k);
      uniqueMissing.push(m);
      missingVars[m] = (missingVars[m] ?? 0) + 1;
    }
    if (opts.requireVars && uniqueMissing.length) {
      return skip("missing_variable", `Empty value for ${uniqueMissing.map((m) => `{{${m}}}`).join(", ")}`);
    }
    if (messages.length >= max) return skip("max_reached", `Limit of ${max} messages reached`);

    const warnings = uniqueMissing.map((m) => `Empty value for {{${m}}}; rendered as ""`);
    const localPart = lower.slice(0, lower.lastIndexOf("@"));
    if (ROLE_LOCAL_PARTS.includes(localPart)) warnings.push(`${address} is a role address (${localPart}@); it may not reach a person`);

    const name = displayName(lookup) ?? (parsed.name ? oneLine(parsed.name) : undefined);
    const msg: MergedMessage = {
      to: name ? { name, address } : { address },
      subject,
      row,
      rowIndex,
      warnings,
    };
    if (html !== undefined) msg.html = html;
    if (text !== undefined) msg.text = text;
    messages.push(msg);
    sent.add(lower);
  });

  return { messages, report: { total: list.length, ok: messages.length, skipped, missingVars } };
}

/** Alias of `merge`. */
export const mergeAll: typeof merge = merge;
