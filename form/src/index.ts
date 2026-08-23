/**
 * @lacspace/form
 * End-to-end form handling for the server — turn a `FormData` (or a plain
 * object) into typed, validated data with built-in spam protection, and get
 * back either your data or per-field errors ready to re-render.
 *
 * Framework-agnostic, but shaped for Next.js Server Actions.
 *
 * ```ts
 * "use server";
 * import { createForm } from "@lacspace/form";
 * import { v } from "@lacspace/validate";
 *
 * const contact = createForm({
 *   schema: v.object({
 *     name: v.string().min(2),
 *     email: v.string().email(),
 *     message: v.string().min(10),
 *   }),
 *   honeypot: "company",   // a hidden field bots love to fill
 * });
 *
 * export async function submit(prev, formData) {
 *   const r = contact.action(prev, formData);
 *   if (!r.ok) return r;                       // { errors, values } → re-render
 *   await sendEmail(r.data);                   // fully typed
 *   return { ok: true };
 * }
 * ```
 *
 * Zero dependencies · isomorphic · fully typed.
 */

/* ------------------------------------------------------------------ *
 * Validator contract — structurally compatible with @lacspace/validate
 * (and, in practice, with zod). No hard dependency either way.
 * ------------------------------------------------------------------ */

export interface Validator<T> {
  safeParse(input: unknown):
    | { success: true; data: T }
    | { success: false; error: { flatten(): Record<string, string> } };
}

/* ------------------------------------------------------------------ *
 * Options & results
 * ------------------------------------------------------------------ */

export interface FormOptions<T> {
  /** A schema with `safeParse` — e.g. `v.object({...})` from @lacspace/validate. */
  schema: Validator<T>;
  /**
   * Name of a hidden "honeypot" field that real users never see and never fill.
   * If it arrives non-empty, the submission is treated as spam.
   */
  honeypot?: string;
  /**
   * Reject submissions that arrive faster than this many ms after the form was
   * rendered. Requires a hidden timestamp field (see `timestampField`).
   */
  minSubmitMs?: number;
  /** Hidden field holding the render time in ms. Default `"_ts"`. */
  timestampField?: string;
  /** Message returned when a submission is flagged as spam. */
  spamMessage?: string;
  /** Key used for form-level (non-field) errors. Default `"_form"`. */
  formErrorKey?: string;
}

export type FormResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      /** `{ email: "Invalid email", _form: "..." }` — render next to inputs. */
      errors: Record<string, string>;
      /** The raw submitted values, so the form can be re-rendered as typed. */
      values: Record<string, unknown>;
      /** True when the failure was a spam/bot heuristic, not user error. */
      spam?: boolean;
    };

const DEFAULT_TS_FIELD = "_ts";
const DEFAULT_FORM_KEY = "_form";
const DEFAULT_SPAM_MSG = "Your submission could not be processed. Please try again.";

/* ------------------------------------------------------------------ *
 * FormData → plain object
 * ------------------------------------------------------------------ */

/** Minimal structural shape of the parts of FormData we use. */
interface FormDataLike {
  entries(): IterableIterator<[string, unknown]>;
}

function isFormData(x: unknown): x is FormDataLike {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as { entries?: unknown }).entries === "function" &&
    typeof (x as { append?: unknown }).append === "function"
  );
}

/**
 * Convert a `FormData` into a plain object. Repeated keys become arrays; File
 * values are passed through untouched. Empty strings are preserved (validation
 * decides what "required" means).
 */
export function formDataToObject(fd: FormDataLike): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of fd.entries()) {
    if (key in out) {
      const existing = out[key];
      if (Array.isArray(existing)) existing.push(value);
      else out[key] = [existing, value];
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Normalise any accepted input to a plain object. */
function toObject(input: FormDataLike | Record<string, unknown>): Record<string, unknown> {
  return isFormData(input) ? formDataToObject(input) : { ...input };
}

/* ------------------------------------------------------------------ *
 * Core handler
 * ------------------------------------------------------------------ */

/**
 * Validate an input (FormData or object) against a schema, applying spam
 * heuristics first. Returns typed data or per-field errors + the raw values.
 */
export function handleForm<T>(
  input: FormDataLike | Record<string, unknown>,
  opts: FormOptions<T>,
): FormResult<T> {
  const values = toObject(input);
  const formKey = opts.formErrorKey ?? DEFAULT_FORM_KEY;

  // 1. Honeypot — a non-empty hidden field means a bot.
  if (opts.honeypot) {
    const trap = values[opts.honeypot];
    if (typeof trap === "string" ? trap.trim() !== "" : trap != null && trap !== "") {
      return spam(opts, values, formKey);
    }
  }

  // 2. Timing — submitted implausibly fast after render.
  if (opts.minSubmitMs && opts.minSubmitMs > 0) {
    const tsField = opts.timestampField ?? DEFAULT_TS_FIELD;
    const raw = values[tsField];
    const ts = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
    if (Number.isFinite(ts)) {
      const elapsed = Date.now() - ts;
      if (elapsed >= 0 && elapsed < opts.minSubmitMs) {
        return spam(opts, values, formKey);
      }
    }
  }

  // 3. Strip internal fields before validation so schemas can stay `.strict()`.
  const cleaned = stripInternal(values, opts);

  // 4. Validate.
  const r = opts.schema.safeParse(cleaned);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, errors: r.error.flatten(), values: cleaned };
}

function stripInternal<T>(values: Record<string, unknown>, opts: FormOptions<T>): Record<string, unknown> {
  const drop = new Set<string>();
  if (opts.honeypot) drop.add(opts.honeypot);
  drop.add(opts.timestampField ?? DEFAULT_TS_FIELD);
  if (drop.size === 0) return values;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(values)) if (!drop.has(k)) out[k] = values[k];
  return out;
}

function spam<T>(opts: FormOptions<T>, values: Record<string, unknown>, formKey: string): FormResult<T> {
  return {
    ok: false,
    spam: true,
    values,
    errors: { [formKey]: opts.spamMessage ?? DEFAULT_SPAM_MSG },
  };
}

/* ------------------------------------------------------------------ *
 * createForm — reusable handler bound to one schema
 * ------------------------------------------------------------------ */

export interface Form<T> {
  /** Validate any input; returns typed data or errors. */
  handle(input: FormDataLike | Record<string, unknown>): FormResult<T>;
  /**
   * Next.js Server Action signature `(prevState, formData) => result`.
   * The previous state is ignored; it exists so this drops straight into
   * `useActionState`.
   */
  action(prevState: unknown, formData: FormDataLike): FormResult<T>;
}

/** Bind a schema + spam options once and reuse the handler across requests. */
export function createForm<T>(opts: FormOptions<T>): Form<T> {
  return {
    handle: (input) => handleForm(input, opts),
    action: (_prev, formData) => handleForm(formData, opts),
  };
}

/* ------------------------------------------------------------------ *
 * Client helpers (framework-agnostic, no React needed)
 * ------------------------------------------------------------------ */

/**
 * Attributes for a visually-hidden honeypot input. Spread onto an `<input>`:
 * `<input {...honeypotProps("company")} />`.
 */
export function honeypotProps(name: string): {
  type: "text";
  name: string;
  tabIndex: -1;
  autoComplete: "off";
  "aria-hidden": "true";
  style: Record<string, string>;
} {
  return {
    type: "text",
    name,
    tabIndex: -1,
    autoComplete: "off",
    "aria-hidden": "true",
    style: {
      position: "absolute",
      width: "1px",
      height: "1px",
      padding: "0",
      margin: "-1px",
      overflow: "hidden",
      clip: "rect(0 0 0 0)",
      whiteSpace: "nowrap",
      border: "0",
    },
  };
}

/** A `<input type="hidden">`-ready render timestamp for the timing check. */
export function timestampValue(): string {
  return String(Date.now());
}
