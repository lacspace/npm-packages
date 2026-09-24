/**
 * Advanced form controls — the inputs that every product needs and no platform
 * ships: sliders, steppers, OTP boxes, comboboxes, chips, search, passwords,
 * file drops, colour pickers and grouped choices.
 *
 * Everything interesting in here is a plain exported function (see "Pure
 * logic" below). The components are thin wiring on top, which is what makes
 * the behaviour testable without a DOM and reusable without a fork.
 */
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ButtonHTMLAttributes,
  ChangeEvent,
  ClipboardEvent as ReactClipboardEvent,
  DragEvent as ReactDragEvent,
  FieldsetHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import { classes, clamp, percent, useControllable, useStableId, type Size } from "./util.js";
import { Checkbox, Field, Input, Radio } from "./input.js";

/* ==========================================================================
   Pure logic — numbers
   ========================================================================== */

/**
 * How many digits sit after the decimal point, exponent notation included.
 * Used to round away the float dust that `min + steps * step` produces:
 * `0.1 + 0.2` must present as `0.3`, not `0.30000000000000004`.
 */
export function decimalPlaces(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const text = String(Math.abs(value));
  const exponent = text.indexOf("e-");
  if (exponent >= 0) {
    const mantissa = text.slice(0, exponent);
    const dot = mantissa.indexOf(".");
    const base = dot >= 0 ? mantissa.length - dot - 1 : 0;
    return base + Number(text.slice(exponent + 2));
  }
  const dot = text.indexOf(".");
  return dot >= 0 ? text.length - dot - 1 : 0;
}

/** Round to a fixed number of decimals, returning a number (not a string). */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** Math.max(0, Math.min(15, Math.trunc(decimals)));
  return Math.round(value * factor) / factor;
}

/**
 * Clamp with optional bounds — `undefined` means "no limit on that side",
 * which is the normal case for a number input that only has a minimum.
 */
export function clampNumber(value: number, min?: number, max?: number): number {
  let out = value;
  if (min !== undefined && out < min) out = min;
  if (max !== undefined && out > max) out = max;
  return out;
}

/* ==========================================================================
   Pure logic — slider
   ========================================================================== */

/** The numeric scale a slider maps positions onto. */
export interface SliderScale {
  min: number;
  max: number;
  step: number;
}

/**
 * Snap to the nearest step counted *from `min`*, then clamp.
 *
 * Counting from `min` matters: a 5..100 slider with step 10 should offer
 * 5, 15, 25… not 10, 20, 30. When `max` is not on a step boundary the clamp
 * wins, so the handle can always reach the end of the track.
 */
export function snapToStep(value: number, scale: SliderScale): number {
  const { min, max, step } = scale;
  if (!Number.isFinite(value)) return min;
  if (max <= min) return min;
  if (!(step > 0)) return clamp(value, min, max);
  const steps = Math.round((value - min) / step);
  const snapped = min + steps * step;
  return clamp(roundTo(snapped, decimalPlaces(step) + decimalPlaces(min)), min, max);
}

/** Where a value sits along the track, 0-100. */
export function sliderValueToPercent(value: number, scale: SliderScale): number {
  return percent(value, scale.min, scale.max);
}

/** The stepped value at a position along the track, 0-100. */
export function percentToSliderValue(pct: number, scale: SliderScale): number {
  const ratio = clamp(pct, 0, 100) / 100;
  return snapToStep(scale.min + ratio * (scale.max - scale.min), scale);
}

/** Sort a pair of thumbs so the lower one is always first. */
export function orderThumbs(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

/**
 * Move one thumb of a range, keeping the thumbs in order.
 *
 * The moving thumb is clamped by its neighbours rather than swapped past
 * them — swapping means the handle under your finger suddenly belongs to a
 * different value, which is how range sliders end up feeling broken.
 */
export function setThumbValue(
  values: readonly number[],
  index: number,
  next: number,
  scale: SliderScale,
): number[] {
  const out = [...values];
  if (index < 0 || index >= out.length) return out;
  const lower = index > 0 ? (out[index - 1] ?? scale.min) : scale.min;
  const upper = index < out.length - 1 ? (out[index + 1] ?? scale.max) : scale.max;
  out[index] = clamp(snapToStep(next, scale), lower, upper);
  return out;
}

/**
 * The keyboard contract every slider owes its users. Returns the new value,
 * or `null` when the key is none of ours so the event can bubble untouched.
 */
export function moveThumb(
  value: number,
  key: string,
  scale: SliderScale,
  pageStep?: number,
): number | null {
  const step = scale.step > 0 ? scale.step : 1;
  const big = pageStep && pageStep > 0 ? pageStep : step * 10;
  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return snapToStep(value + step, scale);
    case "ArrowLeft":
    case "ArrowDown":
      return snapToStep(value - step, scale);
    case "PageUp":
      return snapToStep(value + big, scale);
    case "PageDown":
      return snapToStep(value - big, scale);
    case "Home":
      return scale.min;
    case "End":
      return scale.max;
    default:
      return null;
  }
}

/** Index of the thumb nearest a value — which handle a track click should grab. */
export function nearestThumb(values: readonly number[], value: number): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < values.length; i += 1) {
    const candidate = values[i];
    if (candidate === undefined) continue;
    const distance = Math.abs(candidate - value);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}

/* ==========================================================================
   Pure logic — number formatting
   ========================================================================== */

/** Separator and precision rules shared by parsing and formatting. */
export interface NumberFormatOptions {
  /** Decimals to keep. Omit to preserve whatever the user typed. */
  precision?: number;
  /** Group the integer part: `1234567` → `1,234,567`. */
  thousands?: boolean;
  /** Group separator. Change it for locales that use `.` or a space. */
  thousandsSeparator?: string;
  /** Decimal mark. Change it for locales that use `,`. */
  decimalSeparator?: string;
}

/** Insert a group separator every three digits of an integer string. */
export function groupThousands(digits: string, separator = ","): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/**
 * Read a number out of whatever the user typed, tolerating group separators
 * and a locale decimal mark. Returns `null` for empty or unparseable text —
 * `null` and `0` are different answers and a form has to tell them apart.
 */
export function parseNumericInput(text: string, options: NumberFormatOptions = {}): number | null {
  const thousandsSeparator = options.thousandsSeparator ?? ",";
  const decimalSeparator = options.decimalSeparator ?? ".";
  let cleaned = text.trim();
  if (!cleaned) return null;
  if (thousandsSeparator) cleaned = cleaned.split(thousandsSeparator).join("");
  cleaned = cleaned.replace(/\s/g, "");
  if (decimalSeparator !== ".") cleaned = cleaned.split(decimalSeparator).join(".");
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Render a number back into the input, honouring precision and grouping. */
export function formatNumberValue(value: number, options: NumberFormatOptions = {}): string {
  if (!Number.isFinite(value)) return "";
  const thousandsSeparator = options.thousandsSeparator ?? ",";
  const decimalSeparator = options.decimalSeparator ?? ".";
  const negative = value < 0;
  const absolute = Math.abs(value);
  const fixed =
    options.precision === undefined
      ? String(roundTo(absolute, 12))
      : absolute.toFixed(Math.max(0, Math.trunc(options.precision)));
  const [integerPart = "0", fractionPart] = fixed.split(".");
  const grouped = options.thousands ? groupThousands(integerPart, thousandsSeparator) : integerPart;
  const tail = fractionPart ? `${decimalSeparator}${fractionPart}` : "";
  return `${negative ? "-" : ""}${grouped}${tail}`;
}

/** Bounds and granularity for a stepper. */
export interface NumberStepOptions {
  step?: number;
  min?: number;
  max?: number;
  precision?: number;
}

/**
 * One press of the up/down stepper. From an empty field the first press lands
 * on `min` (or zero) instead of jumping a step away from nothing.
 */
export function stepNumber(
  value: number | null,
  direction: 1 | -1,
  options: NumberStepOptions = {},
): number {
  const step = options.step && options.step > 0 ? options.step : 1;
  const start = value ?? options.min ?? 0;
  const raw = value === null ? start : start + direction * step;
  const decimals = options.precision ?? decimalPlaces(step);
  return clampNumber(roundTo(raw, decimals), options.min, options.max);
}

/* ==========================================================================
   Pure logic — pin / OTP
   ========================================================================== */

/** Which characters an OTP field will accept. */
export type PinType = "numeric" | "alphanumeric" | "any";

/** The character test behind a `PinType`. */
export function pinPattern(type: PinType): RegExp {
  if (type === "numeric") return /[0-9]/;
  if (type === "alphanumeric") return /[a-z0-9]/i;
  return /\S/;
}

/** Split a string into exactly `length` single-character slots. */
export function padPin(value: string, length: number): string[] {
  const chars = Array.from(value);
  const out: string[] = [];
  for (let i = 0; i < length; i += 1) out.push(chars[i] ?? "");
  return out;
}

/**
 * Spread pasted (or typed) text across the boxes from `startIndex` on.
 *
 * Characters that fail the pattern are dropped rather than rejected wholesale,
 * so pasting `123-456` into a 6-box numeric code just works — which is exactly
 * how the code arrived in the user's SMS.
 */
export function distributePin(
  current: readonly string[],
  text: string,
  startIndex: number,
  length: number,
  type: PinType = "numeric",
): string[] {
  const pattern = pinPattern(type);
  const incoming = Array.from(text).filter((char) => pattern.test(char));
  const out: string[] = [];
  for (let i = 0; i < length; i += 1) out.push(current[i] ?? "");
  let cursor = Math.max(0, Math.trunc(startIndex));
  for (const char of incoming) {
    if (cursor >= length) break;
    out[cursor] = char;
    cursor += 1;
  }
  return out;
}

/** The first empty box, or `-1` when the code is full. */
export function firstEmptyPinIndex(chars: readonly string[]): number {
  for (let i = 0; i < chars.length; i += 1) {
    if (!chars[i]) return i;
  }
  return -1;
}

/* ==========================================================================
   Pure logic — combobox
   ========================================================================== */

/** One row of a combobox listbox. */
export interface ComboboxOption {
  value: string;
  label: string;
  /** Not selectable, but still announced and still counted in the list. */
  disabled?: boolean;
  /** Secondary line under the label. */
  description?: ReactNode;
}

/** Case-insensitive substring match against the label and the value. */
export function defaultComboboxFilter(option: ComboboxOption, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    option.label.toLowerCase().includes(needle) || option.value.toLowerCase().includes(needle)
  );
}

/** Apply a filter (yours or the default) to the option list. */
export function filterOptions<T extends ComboboxOption>(
  options: readonly T[],
  query: string,
  filter?: (option: T, query: string) => boolean,
): T[] {
  const test = filter ?? ((option: T, q: string) => defaultComboboxFilter(option, q));
  return options.filter((option) => test(option, query));
}

/**
 * Move the highlight by `delta`, wrapping at both ends.
 *
 * `-1` means "nothing highlighted"; from there Down lands on the first row and
 * Up on the last, which is what keyboard users expect from a freshly opened
 * list.
 */
export function moveHighlight(current: number, delta: number, count: number, wrap = true): number {
  if (count <= 0) return -1;
  if (current < 0) return delta >= 0 ? 0 : count - 1;
  const next = current + delta;
  if (next < 0) return wrap ? count - 1 : 0;
  if (next >= count) return wrap ? 0 : count - 1;
  return next;
}

/** Like `moveHighlight`, but skips disabled rows. `-1` when every row is disabled. */
export function nextEnabledIndex<T extends { disabled?: boolean }>(
  options: readonly T[],
  current: number,
  delta: number,
  wrap = true,
): number {
  const count = options.length;
  if (count === 0) return -1;
  let index = current;
  for (let hops = 0; hops < count; hops += 1) {
    index = moveHighlight(index, delta, count, wrap);
    const option = options[index];
    if (option && !option.disabled) return index;
    if (!wrap && (index === 0 || index === count - 1) && hops > 0) break;
  }
  return -1;
}

/* ==========================================================================
   Pure logic — password strength
   ========================================================================== */

/** Passwords so common that length and variety stop meaning anything. */
export const COMMON_PASSWORDS: readonly string[] = [
  "123456", "123456789", "12345678", "password", "qwerty", "abc123", "111111",
  "letmein", "monkey", "dragon", "iloveyou", "admin", "welcome", "login",
  "passw0rd", "password1", "password123", "qwerty123", "1q2w3e4r", "sunshine",
  "princess", "football", "baseball", "superman", "trustno1", "master",
  "hello", "freedom", "whatever", "starwars", "changeme", "secret",
];

/** The verdict a strength meter renders. */
export interface PasswordStrength {
  /** 0 (hopeless) to 4 (good). */
  score: 0 | 1 | 2 | 3 | 4;
  /** Human label for the score. */
  label: string;
  /** Score as a 0-100 bar width. */
  percent: number;
  /** What to fix, in the order worth fixing it. */
  suggestions: string[];
}

const STRENGTH_LABELS = ["Very weak", "Weak", "Fair", "Strong", "Very strong"] as const;

/**
 * Score a password on length, character variety and repetition, then veto the
 * lot if it is a known-common password. Deliberately transparent arithmetic:
 * a meter users cannot predict is a meter users ignore.
 */
export function scorePassword(
  password: string,
  options: { common?: readonly string[]; minLength?: number } = {},
): PasswordStrength {
  const minLength = options.minLength ?? 8;
  const common = options.common ?? COMMON_PASSWORDS;
  const suggestions: string[] = [];

  if (!password) {
    return { score: 0, label: STRENGTH_LABELS[0], percent: 0, suggestions: ["Enter a password"] };
  }

  const lower = /[a-z]/.test(password);
  const upper = /[A-Z]/.test(password);
  const digit = /[0-9]/.test(password);
  const symbol = /[^A-Za-z0-9]/.test(password);
  const variety = [lower, upper, digit, symbol].filter(Boolean).length;

  let points = 0;
  if (password.length >= minLength) points += 1;
  if (password.length >= minLength + 4) points += 1;
  if (password.length >= minLength + 8) points += 1;
  if (variety >= 2) points += 1;
  if (variety >= 3) points += 1;
  if (variety >= 4) points += 1;
  if (/(.)\1{2,}/.test(password)) points -= 1;
  if (/^[a-z]+$/i.test(password) || /^\d+$/.test(password)) points -= 1;

  if (password.length < minLength) suggestions.push(`Use at least ${minLength} characters`);
  if (!upper || !lower) suggestions.push("Mix upper and lower case");
  if (!digit) suggestions.push("Add a number");
  if (!symbol) suggestions.push("Add a symbol");

  let score: 0 | 1 | 2 | 3 | 4;
  if (points <= 1) score = 0;
  else if (points === 2) score = 1;
  else if (points === 3) score = 2;
  else if (points === 4) score = 3;
  else score = 4;

  const normalized = password.toLowerCase();
  if (common.includes(normalized)) {
    score = 0;
    suggestions.unshift("This is one of the most common passwords in the world");
  } else if (password.length < minLength + 4 && common.some((entry) => normalized.includes(entry))) {
    score = score > 1 ? 1 : score;
    suggestions.unshift("Contains a very common password");
  }

  return {
    score,
    label: STRENGTH_LABELS[score],
    percent: score * 25,
    suggestions,
  };
}

/* ==========================================================================
   Pure logic — files
   ========================================================================== */

/**
 * The part of `File` the validator needs. Typed structurally so the rules can
 * be tested (and run on a server) without a DOM `File` anywhere in sight.
 */
export interface FileLike {
  name: string;
  size: number;
  type: string;
}

/** Why a file did not make it in. */
export type FileRejectionReason = "type" | "size" | "count" | "duplicate";

/** A rejected file and the sentence to show the user about it. */
export interface FileRejection {
  file: FileLike;
  reason: FileRejectionReason;
  message: string;
}

/** Rules for `validateFiles`. */
export interface FileValidationOptions {
  /** An `<input accept>` list: `.pdf,image/*,text/csv`. Empty accepts everything. */
  accept?: string;
  /** Per-file byte ceiling. */
  maxSize?: number;
  /** When false, only the first file survives. */
  multiple?: boolean;
  /** Ceiling on the total, counting `existing`. */
  maxFiles?: number;
  /** Files already picked, so re-dropping one is a duplicate rather than a copy. */
  existing?: readonly FileLike[];
}

/** Human file size — `1536` → `1.5 KB`. */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${roundTo(value, decimals)} ${units[unit] ?? "TB"}`;
}

/** Does a file satisfy an `accept` list? Extensions, mime types and `image/*` all work. */
export function matchesAccept(file: FileLike, accept?: string): boolean {
  if (!accept || !accept.trim()) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  const tokens = accept
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.some((token) => {
    if (token === "*" || token === "*/*") return true;
    if (token.startsWith(".")) return name.endsWith(token);
    if (token.endsWith("/*")) return type.startsWith(token.slice(0, -1));
    return type === token;
  });
}

function fileKey(file: FileLike): string {
  return `${file.name}:${file.size}`;
}

/**
 * Split an incoming batch into what a drop zone keeps and what it turns away,
 * with a reason per rejection. Order is preserved, so the list a user sees
 * matches the order they dropped.
 */
export function validateFiles<T extends FileLike>(
  incoming: readonly T[],
  options: FileValidationOptions = {},
): { accepted: T[]; rejected: FileRejection[] } {
  const multiple = options.multiple ?? true;
  const existing = options.existing ?? [];
  const limit = multiple ? options.maxFiles ?? Infinity : 1;
  const accepted: T[] = [];
  const rejected: FileRejection[] = [];
  const seen = new Set(existing.map(fileKey));
  let count = multiple ? existing.length : 0;

  for (const file of incoming) {
    if (!matchesAccept(file, options.accept)) {
      rejected.push({ file, reason: "type", message: `${file.name} is not an accepted file type` });
    } else if (options.maxSize !== undefined && file.size > options.maxSize) {
      rejected.push({
        file,
        reason: "size",
        message: `${file.name} is larger than ${formatBytes(options.maxSize)}`,
      });
    } else if (seen.has(fileKey(file))) {
      rejected.push({ file, reason: "duplicate", message: `${file.name} has already been added` });
    } else if (count >= limit) {
      rejected.push({
        file,
        reason: "count",
        message: multiple
          ? `Only ${limit} file${limit === 1 ? "" : "s"} can be uploaded`
          : "Only one file can be uploaded",
      });
    } else {
      accepted.push(file);
      seen.add(fileKey(file));
      count += 1;
    }
  }

  return { accepted, rejected };
}

/* ==========================================================================
   Pure logic — colour
   ========================================================================== */

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Is this a hex colour — 3, 4, 6 or 8 digits, `#` optional? */
export function isValidHex(input: string): boolean {
  return HEX_RE.test(input.trim());
}

/**
 * Normalise to the long lowercase form: `ABC` → `#aabbcc`, `#12345678` kept.
 * Returns `null` when it is not a hex colour at all, so a caller can tell
 * "not finished typing" apart from "wrong".
 */
export function normalizeHex(input: string): string | null {
  const match = HEX_RE.exec(input.trim());
  if (!match) return null;
  const digits = (match[1] ?? "").toLowerCase();
  if (digits.length === 3 || digits.length === 4) {
    return `#${Array.from(digits)
      .map((char) => char + char)
      .join("")}`;
  }
  return `#${digits}`;
}

/** Drop an alpha pair — `<input type="color">` only understands `#rrggbb`. */
export function hexWithoutAlpha(hex: string): string {
  const normalized = normalizeHex(hex);
  if (!normalized) return "#000000";
  return normalized.length === 9 ? normalized.slice(0, 7) : normalized;
}

/* ==========================================================================
   Pure logic — selection + timing
   ========================================================================== */

/** How a click changes a selection. */
export interface ToggleSelectionOptions {
  /** Many at once, or one at a time. */
  multiple?: boolean;
  /** May the last selected item be turned off, leaving nothing selected? */
  allowDeselect?: boolean;
  /** Ceiling for `multiple`. Extra clicks are ignored rather than swapping. */
  max?: number;
}

/**
 * The selection reducer behind `ToggleGroup`, `CheckboxGroup` and
 * `MultiSelect`. Returns the *same array instance* when nothing changes, so a
 * caller can skip a re-render with a reference check.
 */
export function toggleSelection(
  current: readonly string[],
  value: string,
  options: ToggleSelectionOptions = {},
): string[] {
  const { multiple = false, allowDeselect = true, max } = options;
  const selected = current.includes(value);

  if (!multiple) {
    if (selected) return allowDeselect ? [] : [...current];
    return [value];
  }
  if (selected) return current.filter((entry) => entry !== value);
  if (max !== undefined && current.length >= max) return [...current];
  return [...current, value];
}

/** A debounced function, plus the `cancel` an unmounting component must call. */
export type Debounced<A extends unknown[]> = ((...args: A) => void) & { cancel: () => void };

/**
 * Trailing-edge debounce over `setTimeout` — no DOM, so it is safe to create
 * during render on the server. Always `cancel()` it in an effect cleanup, or a
 * search fires into an unmounted component.
 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  wait: number,
): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = (...args: A): void => {
    if (timer !== undefined) clearTimeout(timer);
    if (wait <= 0) {
      fn(...args);
      return;
    }
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, wait);
  };
  run.cancel = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  return run;
}

/* ==========================================================================
   Internal helpers
   ========================================================================== */

interface FieldShellProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  id: string;
  children: (parts: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}

/**
 * Wrap a control in `Field` only when there is something to wrap it with, so a
 * bare `<NumberInput />` stays a single element in the DOM.
 */
function FieldShell({ label, hint, error, required, id, children }: FieldShellProps): JSX.Element {
  const wrapped = label != null || hint != null || error != null;
  if (!wrapped) return <>{children({ id, describedBy: undefined, invalid: false })}</>;
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={id}>
      {children}
    </Field>
  );
}

/* ==========================================================================
   Slider
   ========================================================================== */

/** A single value, or `[lower, upper]` when the slider is a range. */
export type SliderValue = number | [number, number];

/** A labelled notch on the track. */
export interface SliderMark {
  value: number;
  label?: ReactNode;
}

export interface SliderProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue"> {
  /** Controlled value. An array turns the slider into a range. */
  value?: SliderValue;
  /** Starting value when uncontrolled. */
  defaultValue?: SliderValue;
  onChange?: (value: SliderValue) => void;
  /** Fires once when a drag ends — the moment to run an expensive query. */
  onCommit?: (value: SliderValue) => void;
  min?: number;
  max?: number;
  /** Granularity. `0` or less means continuous. */
  step?: number;
  /** Two thumbs. Inferred when `value`/`defaultValue` is an array. */
  range?: boolean;
  /** Notches under the track; bare numbers get no label. */
  marks?: Array<number | SliderMark>;
  /** Value bubble above the thumb. `"always"` keeps it visible. */
  tooltip?: boolean | "always";
  /** How much PageUp/PageDown moves. Defaults to ten steps. */
  pageStep?: number;
  disabled?: boolean;
  size?: Size;
  /** Format the bubble and `aria-valuetext` — units, currency, dates. */
  formatValue?: (value: number) => string;
  /** Accessible name. With a range it is suffixed with minimum/maximum. */
  label?: string;
}

function toThumbs(value: SliderValue, scale: SliderScale, range: boolean): number[] {
  if (Array.isArray(value)) {
    const [a = scale.min, b = scale.max] = value;
    return orderThumbs([snapToStep(a, scale), snapToStep(b, scale)]);
  }
  const single = snapToStep(value, scale);
  return range ? orderThumbs([single, scale.max]) : [single];
}

function normalizeMarks(marks: Array<number | SliderMark> | undefined): SliderMark[] {
  if (!marks) return [];
  return marks.map((mark) => (typeof mark === "number" ? { value: mark } : mark));
}

/**
 * A slider with one thumb or two.
 *
 * Both thumbs are real `<button role="slider">` elements, so they are
 * tabbable, announced with their own value, and driveable from the keyboard
 * without a single pointer event — the part that custom sliders usually skip.
 */
export const Slider = forwardRef<HTMLDivElement, SliderProps>(function Slider(
  {
    value,
    defaultValue,
    onChange,
    onCommit,
    min = 0,
    max = 100,
    step = 1,
    range,
    marks,
    tooltip = false,
    pageStep,
    disabled = false,
    size = "md",
    formatValue,
    label,
    className,
    ...rest
  },
  ref,
) {
  const scale = useMemo<SliderScale>(() => ({ min, max, step }), [min, max, step]);
  const isRange = range ?? Array.isArray(value ?? defaultValue);
  const fallback: SliderValue = isRange ? [min, max] : min;
  const [raw, setRaw] = useControllable<SliderValue>(value, defaultValue ?? fallback, onChange);
  const thumbs = useMemo(() => toThumbs(raw, scale, isRange), [raw, scale, isRange]);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(-1);
  const markList = useMemo(() => normalizeMarks(marks), [marks]);

  const emit = useCallback(
    (next: number[], commit = false): void => {
      const first = next[0] ?? min;
      const second = next[1] ?? max;
      const out: SliderValue = isRange ? [first, second] : first;
      setRaw(out);
      if (commit) onCommit?.(out);
    },
    [isRange, min, max, setRaw, onCommit],
  );

  const valueFromClientX = (clientX: number): number => {
    const node = trackRef.current;
    if (!node) return min;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0) return min;
    return percentToSliderValue(((clientX - rect.left) / rect.width) * 100, scale);
  };

  const handleTrackPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (disabled) return;
    const next = valueFromClientX(event.clientX);
    const index = nearestThumb(thumbs, next);
    emit(setThumbValue(thumbs, index, next, scale), true);
  };

  const handleThumbKeyDown = (index: number) => (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (disabled) return;
    const currentValue = thumbs[index];
    if (currentValue === undefined) return;
    const next = moveThumb(currentValue, event.key, scale, pageStep);
    if (next === null) return;
    event.preventDefault();
    emit(setThumbValue(thumbs, index, next, scale), true);
  };

  const lowPercent = sliderValueToPercent(thumbs[0] ?? min, scale);
  const highPercent = isRange ? sliderValueToPercent(thumbs[1] ?? max, scale) : lowPercent;
  const fillStart = isRange ? Math.min(lowPercent, highPercent) : 0;
  const fillEnd = isRange ? Math.max(lowPercent, highPercent) : lowPercent;

  return (
    <div
      {...rest}
      ref={ref}
      className={classes("lac-slider", className)}
      data-size={size}
      data-range={isRange || undefined}
      data-disabled={disabled || undefined}
    >
      <div className="lac-slider-track" ref={trackRef} onPointerDown={handleTrackPointerDown}>
        <div
          className="lac-slider-fill"
          style={{ left: `${fillStart}%`, width: `${Math.max(0, fillEnd - fillStart)}%` }}
        />
        {markList.map((mark) => (
          <span
            key={mark.value}
            className="lac-slider-mark"
            style={{ left: `${sliderValueToPercent(mark.value, scale)}%` }}
            data-active={mark.value <= fillEnd && mark.value >= (isRange ? fillStart : min) || undefined}
          >
            {mark.label != null && <span className="lac-slider-mark-label">{mark.label}</span>}
          </span>
        ))}
        {thumbs.map((thumbValue, index) => (
          <button
            key={index}
            type="button"
            role="slider"
            className="lac-slider-thumb"
            style={{ left: `${sliderValueToPercent(thumbValue, scale)}%` }}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={thumbValue}
            aria-valuetext={formatValue ? formatValue(thumbValue) : undefined}
            aria-orientation="horizontal"
            aria-label={label ? (isRange ? `${label} ${index === 0 ? "minimum" : "maximum"}` : label) : undefined}
            aria-disabled={disabled || undefined}
            disabled={disabled}
            data-dragging={dragging === index || undefined}
            onKeyDown={handleThumbKeyDown(index)}
            onPointerDown={(event) => {
              if (disabled) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              setDragging(index);
            }}
            onPointerMove={(event) => {
              if (dragging !== index) return;
              emit(setThumbValue(thumbs, index, valueFromClientX(event.clientX), scale));
            }}
            onPointerUp={(event) => {
              if (dragging !== index) return;
              event.currentTarget.releasePointerCapture(event.pointerId);
              setDragging(-1);
              emit(thumbs, true);
            }}
          >
            {tooltip && (
              <span className="lac-slider-tip" data-always={tooltip === "always" || undefined}>
                {formatValue ? formatValue(thumbValue) : thumbValue}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
});

/* ==========================================================================
   NumberInput
   ========================================================================== */

export interface NumberInputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "value" | "defaultValue" | "onChange" | "size" | "type"
  > {
  /** Controlled value. `null` is an empty field, which is not the same as `0`. */
  value?: number | null;
  defaultValue?: number | null;
  onChange?: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Decimals to keep when formatting and on blur. */
  precision?: number;
  /** Group the integer part while the field is not focused. */
  thousands?: boolean;
  thousandsSeparator?: string;
  decimalSeparator?: string;
  /** Pull an out-of-range value back inside when the field loses focus. */
  clampOnBlur?: boolean;
  /** Show the ± buttons. */
  stepper?: boolean;
  size?: Size;
  invalid?: boolean;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  incrementLabel?: string;
  decrementLabel?: string;
}

/**
 * A number field that behaves like one: arrows and stepper buttons move by
 * `step`, thousands separators appear when you leave and disappear when you
 * return to edit, and an out-of-range value is pulled back on blur rather than
 * silently rewritten under the cursor mid-typing.
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  {
    value,
    defaultValue = null,
    onChange,
    min,
    max,
    step = 1,
    precision,
    thousands = false,
    thousandsSeparator = ",",
    decimalSeparator = ".",
    clampOnBlur = true,
    stepper = true,
    size = "md",
    invalid,
    label,
    hint,
    error,
    incrementLabel = "Increase",
    decrementLabel = "Decrease",
    id,
    className,
    disabled,
    readOnly,
    onBlur,
    onFocus,
    onKeyDown,
    ...rest
  },
  ref,
) {
  const fieldId = useStableId(id, "number");
  const format = useMemo<NumberFormatOptions>(
    () => ({ precision, thousands, thousandsSeparator, decimalSeparator }),
    [precision, thousands, thousandsSeparator, decimalSeparator],
  );
  const [current, setCurrent] = useControllable<number | null>(value, defaultValue, onChange);
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState<string>(() =>
    current === null ? "" : formatNumberValue(current, format),
  );

  // While the field has focus the user owns the text; outside of that the
  // value owns it, so programmatic changes show up immediately.
  useEffect(() => {
    if (focused) return;
    setText(current === null ? "" : formatNumberValue(current, format));
  }, [current, focused, format]);

  const applyStep = (direction: 1 | -1): void => {
    if (disabled || readOnly) return;
    const next = stepNumber(current, direction, { step, min, max, precision });
    setCurrent(next);
    setText(formatNumberValue(next, format));
  };

  return (
    <FieldShell label={label} hint={hint} error={error} id={fieldId}>
      {({ id: controlId, describedBy, invalid: fieldInvalid }) => (
        <div
          className={classes("lac-number", className)}
          data-size={size}
          data-disabled={disabled || undefined}
        >
          <input
            {...rest}
            ref={ref}
            id={controlId}
            aria-describedby={describedBy}
            className="lac-number-input"
            type="text"
            inputMode={precision === 0 ? "numeric" : "decimal"}
            role="spinbutton"
            value={text}
            disabled={disabled}
            readOnly={readOnly}
            aria-valuenow={current ?? undefined}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-invalid={invalid || fieldInvalid || undefined}
            data-invalid={invalid || fieldInvalid || undefined}
            onFocus={(event) => {
              setFocused(true);
              // Editing is easier without the group separators in the way.
              if (thousands && current !== null) {
                setText(formatNumberValue(current, { ...format, thousands: false }));
              }
              onFocus?.(event);
            }}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setText(event.target.value);
              setCurrent(parseNumericInput(event.target.value, format));
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp") {
                event.preventDefault();
                applyStep(1);
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                applyStep(-1);
              }
              onKeyDown?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              const parsed = parseNumericInput(event.target.value, format);
              if (parsed === null) {
                setCurrent(null);
                setText("");
              } else {
                const settled = clampOnBlur
                  ? clampNumber(roundTo(parsed, precision ?? decimalPlaces(step)), min, max)
                  : roundTo(parsed, precision ?? decimalPlaces(step));
                setCurrent(settled);
                setText(formatNumberValue(settled, format));
              }
              onBlur?.(event);
            }}
          />
          {stepper && (
            <span className="lac-number-steppers">
              <button
                type="button"
                className="lac-number-step"
                aria-label={incrementLabel}
                tabIndex={-1}
                disabled={disabled || readOnly || (max !== undefined && (current ?? min ?? 0) >= max)}
                onClick={() => applyStep(1)}
              >
                <span aria-hidden>+</span>
              </button>
              <button
                type="button"
                className="lac-number-step"
                aria-label={decrementLabel}
                tabIndex={-1}
                disabled={disabled || readOnly || (min !== undefined && (current ?? min) <= min)}
                onClick={() => applyStep(-1)}
              >
                <span aria-hidden>−</span>
              </button>
            </span>
          )}
        </div>
      )}
    </FieldShell>
  );
});

/* ==========================================================================
   PinInput
   ========================================================================== */

export interface PinInputProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue"> {
  /** How many boxes. */
  length?: number;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Fires the moment every box is filled — usually where you submit. */
  onComplete?: (value: string) => void;
  /** Which characters the boxes accept. */
  type?: PinType;
  /** Render dots instead of the characters. */
  mask?: boolean;
  disabled?: boolean;
  size?: Size;
  /** Accessible name for the group. */
  label?: string;
  /** Put the caret in the first box on mount. */
  autoFocus?: boolean;
  /** Autofill hint — `one-time-code` lets iOS offer the SMS code. */
  autoComplete?: string;
  placeholder?: string;
}

/**
 * One-time-code boxes.
 *
 * Paste is the feature that matters: a code copied from an SMS lands across
 * every box at once (punctuation and all), rather than dumping six characters
 * into the first one. Backspace in an empty box steps back and clears, which
 * is the only way to fix a typo without reaching for the mouse.
 */
export const PinInput = forwardRef<HTMLDivElement, PinInputProps>(function PinInput(
  {
    length = 6,
    value,
    defaultValue = "",
    onChange,
    onComplete,
    type = "numeric",
    mask = false,
    disabled = false,
    size = "md",
    label = "Verification code",
    autoFocus = false,
    autoComplete = "one-time-code",
    placeholder = "",
    className,
    ...rest
  },
  ref,
) {
  const [code, setCode] = useControllable<string>(value, defaultValue, onChange);
  const chars = padPin(code, length);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const completed = useRef(false);

  const focusBox = (index: number): void => {
    const node = inputs.current[clamp(index, 0, length - 1)];
    node?.focus();
    node?.select();
  };

  const commit = (next: string[]): void => {
    const joined = next.join("");
    setCode(joined);
    const full = next.every((char) => char !== "");
    if (full && !completed.current) {
      completed.current = true;
      onComplete?.(joined);
    }
    if (!full) completed.current = false;
  };

  const handleChange = (index: number) => (event: ChangeEvent<HTMLInputElement>): void => {
    const typed = event.target.value;
    if (!typed) {
      const next = [...chars];
      next[index] = "";
      commit(next);
      return;
    }
    const next = distributePin(chars, typed, index, length, type);
    commit(next);
    const empty = firstEmptyPinIndex(next);
    focusBox(empty === -1 ? length - 1 : Math.max(empty, index + 1));
  };

  const handleKeyDown = (index: number) => (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Backspace") {
      if (chars[index]) {
        const next = [...chars];
        next[index] = "";
        commit(next);
      } else if (index > 0) {
        event.preventDefault();
        const next = [...chars];
        next[index - 1] = "";
        commit(next);
        focusBox(index - 1);
      }
    } else if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      focusBox(index - 1);
    } else if (event.key === "ArrowRight" && index < length - 1) {
      event.preventDefault();
      focusBox(index + 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusBox(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusBox(length - 1);
    }
  };

  const handlePaste = (index: number) => (event: ReactClipboardEvent<HTMLInputElement>): void => {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text");
    const next = distributePin(chars, pasted, index, length, type);
    commit(next);
    const empty = firstEmptyPinIndex(next);
    focusBox(empty === -1 ? length - 1 : empty);
  };

  return (
    <div
      {...rest}
      ref={ref}
      role="group"
      aria-label={label}
      className={classes("lac-pin", className)}
      data-size={size}
      data-disabled={disabled || undefined}
    >
      {chars.map((char, index) => (
        <input
          key={index}
          ref={(node) => {
            inputs.current[index] = node;
          }}
          className="lac-pin-box"
          type={mask ? "password" : "text"}
          inputMode={type === "numeric" ? "numeric" : "text"}
          autoComplete={index === 0 ? autoComplete : "off"}
          autoFocus={autoFocus && index === 0}
          maxLength={1}
          value={char}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={`${label}, digit ${index + 1} of ${length}`}
          onChange={handleChange(index)}
          onKeyDown={handleKeyDown(index)}
          onPaste={handlePaste(index)}
          onFocus={(event) => event.currentTarget.select()}
        />
      ))}
    </div>
  );
});

/* ==========================================================================
   Combobox
   ========================================================================== */

export interface ComboboxProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue"> {
  options: ComboboxOption[];
  /** Controlled selected value. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Controlled text in the box, when you want to drive the query yourself. */
  inputValue?: string;
  onInputChange?: (text: string) => void;
  /** Replace the matching rule — fuzzy, accent-folding, server-side, anything. */
  filter?: (option: ComboboxOption, query: string) => boolean;
  /** Keep whatever was typed even when it matches no option. */
  allowFreeText?: boolean;
  /** Shown in the list when nothing matches. */
  emptyMessage?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  size?: Size;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Accessible name when `label` is not used. */
  "aria-label"?: string;
  /** Emit a hidden input so the value posts with a plain HTML form. */
  name?: string;
}

/**
 * A text box wired to a filtered listbox.
 *
 * The input keeps focus at all times and the active row is pointed at with
 * `aria-activedescendant` — the pattern screen readers actually announce.
 * Moving focus into the list instead is the classic mistake that breaks
 * typing mid-selection.
 */
export const Combobox = forwardRef<HTMLInputElement, ComboboxProps>(function Combobox(
  {
    options = [],
    value,
    defaultValue = "",
    onChange,
    inputValue,
    onInputChange,
    filter,
    allowFreeText = false,
    emptyMessage = "No results",
    placeholder,
    disabled = false,
    invalid,
    size = "md",
    label,
    hint,
    error,
    name,
    id,
    className,
    ...rest
  },
  ref,
) {
  const baseId = useStableId(id, "combobox");
  const listId = `${baseId}-list`;
  const [selected, setSelected] = useControllable<string>(value, defaultValue, onChange);
  const selectedOption = options.find((option) => option.value === selected);
  const [query, setQuery] = useControllable<string>(
    inputValue,
    selectedOption?.label ?? defaultValue,
    onInputChange,
  );
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const typed = useRef(false);

  const visible = useMemo(
    () => (typed.current ? filterOptions(options, query, filter) : options),
    [options, query, filter],
  );

  // Follow a value that changed from outside while the box is closed.
  useEffect(() => {
    if (open || inputValue !== undefined) return;
    const match = options.find((option) => option.value === selected);
    if (match) setQuery(match.label);
  }, [selected, open, options, inputValue, setQuery]);

  const choose = (option: ComboboxOption | undefined): void => {
    if (!option || option.disabled) return;
    typed.current = false;
    setSelected(option.value);
    setQuery(option.label);
    setOpen(false);
    setHighlight(-1);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      setHighlight(nextEnabledIndex(visible, highlight, event.key === "ArrowDown" ? 1 : -1));
      return;
    }
    if (event.key === "Home" && open) {
      event.preventDefault();
      setHighlight(nextEnabledIndex(visible, -1, 1));
      return;
    }
    if (event.key === "End" && open) {
      event.preventDefault();
      setHighlight(nextEnabledIndex(visible, -1, -1));
      return;
    }
    if (event.key === "Enter" && open && highlight >= 0) {
      event.preventDefault();
      choose(visible[highlight]);
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      setHighlight(-1);
      return;
    }
    if (event.key === "Tab") setOpen(false);
  };

  const handleBlur = (): void => {
    setOpen(false);
    setHighlight(-1);
    if (allowFreeText) {
      typed.current = false;
      setSelected(query);
      return;
    }
    const match = options.find((option) => option.value === selected);
    typed.current = false;
    setQuery(match ? match.label : "");
    if (!match) setSelected("");
  };

  return (
    <FieldShell label={label} hint={hint} error={error} id={baseId}>
      {({ id: controlId, describedBy, invalid: fieldInvalid }) => (
        <div
          {...rest}
          className={classes("lac-combobox", className)}
          data-size={size}
          data-open={open || undefined}
          data-disabled={disabled || undefined}
        >
          <input
            ref={ref}
            id={controlId}
            className="lac-combobox-input"
            type="text"
            role="combobox"
            autoComplete="off"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && highlight >= 0 ? `${baseId}-opt-${highlight}` : undefined
            }
            aria-describedby={describedBy}
            aria-invalid={invalid || fieldInvalid || undefined}
            data-invalid={invalid || fieldInvalid || undefined}
            aria-label={rest["aria-label"]}
            placeholder={placeholder}
            disabled={disabled}
            value={query}
            onChange={(event) => {
              typed.current = true;
              setQuery(event.target.value);
              setOpen(true);
              setHighlight(-1);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setOpen(true)}
            onBlur={handleBlur}
          />
          {name && <input type="hidden" name={name} value={selected} />}
          <ul className="lac-combobox-list" id={listId} role="listbox" hidden={!open}>
            {visible.length === 0 ? (
              <li className="lac-combobox-empty" role="presentation">
                {emptyMessage}
              </li>
            ) : (
              visible.map((option, index) => (
                <li
                  key={option.value}
                  id={`${baseId}-opt-${index}`}
                  role="option"
                  className="lac-combobox-option"
                  aria-selected={option.value === selected}
                  aria-disabled={option.disabled || undefined}
                  data-highlighted={index === highlight || undefined}
                  data-disabled={option.disabled || undefined}
                  // A pointerdown on the list would blur the input first and
                  // close the list out from under the click.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option)}
                  onMouseEnter={() => setHighlight(index)}
                >
                  <span className="lac-combobox-label">{option.label}</span>
                  {option.description != null && (
                    <span className="lac-combobox-desc">{option.description}</span>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </FieldShell>
  );
});

/* ==========================================================================
   MultiSelect
   ========================================================================== */

export interface MultiSelectProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue"> {
  options: ComboboxOption[];
  /** Controlled selection. */
  value?: string[];
  defaultValue?: string[];
  onChange?: (value: string[]) => void;
  filter?: (option: ComboboxOption, query: string) => boolean;
  /** Stop accepting picks past this many. */
  max?: number;
  emptyMessage?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  size?: Size;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  "aria-label"?: string;
  /** Label for a chip's remove button. Gets the option label appended. */
  removeLabel?: string;
}

/**
 * A combobox that keeps what you picked as chips in the control.
 *
 * Backspace on an empty box removes the last chip — the shortcut every email
 * "To:" field has taught people to expect. Chosen rows stay in the list,
 * marked `aria-selected`, so a mis-click is one click to undo.
 */
export const MultiSelect = forwardRef<HTMLInputElement, MultiSelectProps>(function MultiSelect(
  {
    options = [],
    value,
    defaultValue,
    onChange,
    filter,
    max,
    emptyMessage = "No results",
    placeholder,
    disabled = false,
    invalid,
    size = "md",
    label,
    hint,
    error,
    removeLabel = "Remove",
    id,
    className,
    ...rest
  },
  ref,
) {
  const baseId = useStableId(id, "multiselect");
  const listId = `${baseId}-list`;
  const emptyDefault = useRef<string[]>([]);
  const [selected, setSelected] = useControllable<string[]>(
    value,
    defaultValue ?? emptyDefault.current,
    onChange,
  );
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const visible = useMemo(() => filterOptions(options, query, filter), [options, query, filter]);
  const chips = selected
    .map((entry) => options.find((option) => option.value === entry) ?? { value: entry, label: entry })
    .filter((option): option is ComboboxOption => Boolean(option));

  const toggle = (option: ComboboxOption | undefined): void => {
    if (!option || option.disabled) return;
    setSelected(toggleSelection(selected, option.value, { multiple: true, max }));
    setQuery("");
    setHighlight(-1);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      setHighlight(nextEnabledIndex(visible, highlight, event.key === "ArrowDown" ? 1 : -1));
      return;
    }
    if (event.key === "Enter" && open && highlight >= 0) {
      event.preventDefault();
      toggle(visible[highlight]);
      return;
    }
    if (event.key === "Backspace" && query === "" && selected.length > 0) {
      event.preventDefault();
      setSelected(selected.slice(0, -1));
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      setHighlight(-1);
    }
  };

  const full = max !== undefined && selected.length >= max;

  return (
    <FieldShell label={label} hint={hint} error={error} id={baseId}>
      {({ id: controlId, describedBy, invalid: fieldInvalid }) => (
        <div
          {...rest}
          className={classes("lac-multiselect", className)}
          data-size={size}
          data-open={open || undefined}
          data-disabled={disabled || undefined}
        >
          <div
            className="lac-multiselect-control"
            data-invalid={invalid || fieldInvalid || undefined}
          >
            {chips.map((chip) => (
              <span key={chip.value} className="lac-chip">
                <span className="lac-chip-label">{chip.label}</span>
                <button
                  type="button"
                  className="lac-chip-remove"
                  aria-label={`${removeLabel} ${chip.label}`}
                  disabled={disabled}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setSelected(selected.filter((entry) => entry !== chip.value))}
                >
                  <span aria-hidden>×</span>
                </button>
              </span>
            ))}
            <input
              ref={ref}
              id={controlId}
              className="lac-multiselect-input"
              type="text"
              role="combobox"
              autoComplete="off"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={
                open && highlight >= 0 ? `${baseId}-opt-${highlight}` : undefined
              }
              aria-describedby={describedBy}
              aria-invalid={invalid || fieldInvalid || undefined}
              aria-label={rest["aria-label"]}
              placeholder={chips.length === 0 ? placeholder : undefined}
              disabled={disabled}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(true);
                setHighlight(-1);
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => setOpen(true)}
              onBlur={() => {
                setOpen(false);
                setHighlight(-1);
                setQuery("");
              }}
            />
          </div>
          <ul className="lac-combobox-list" id={listId} role="listbox" aria-multiselectable hidden={!open}>
            {visible.length === 0 ? (
              <li className="lac-combobox-empty" role="presentation">
                {emptyMessage}
              </li>
            ) : (
              visible.map((option, index) => {
                const isSelected = selected.includes(option.value);
                return (
                  <li
                    key={option.value}
                    id={`${baseId}-opt-${index}`}
                    role="option"
                    className="lac-combobox-option"
                    aria-selected={isSelected}
                    aria-disabled={(option.disabled || (full && !isSelected)) || undefined}
                    data-highlighted={index === highlight || undefined}
                    data-disabled={(option.disabled || (full && !isSelected)) || undefined}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => (full && !isSelected ? undefined : toggle(option))}
                    onMouseEnter={() => setHighlight(index)}
                  >
                    <span className="lac-combobox-label">{option.label}</span>
                    {isSelected && <span aria-hidden>✓</span>}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </FieldShell>
  );
});

/* ==========================================================================
   SearchInput
   ========================================================================== */

export interface SearchInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "size" | "type"> {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Fires `debounceMs` after typing stops, and immediately on clear/Enter. */
  onSearch?: (query: string) => void;
  /** Quiet period before `onSearch`. `0` fires on every keystroke. */
  debounceMs?: number;
  /** Show the × once there is something to clear. */
  clearable?: boolean;
  clearLabel?: string;
  /** Replace the magnifier. */
  icon?: ReactNode;
  size?: Size;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}

const SearchIcon = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
    <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.6" />
    <path d="M10.6 10.6 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

/**
 * A search box that debounces for you.
 *
 * `onChange` fires on every keystroke so the field stays responsive, while
 * `onSearch` waits for a pause — and the timer is cancelled on unmount, which
 * is the leak most hand-rolled debounces ship with.
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  {
    value,
    defaultValue = "",
    onChange,
    onSearch,
    debounceMs = 300,
    clearable = true,
    clearLabel = "Clear search",
    icon,
    size = "md",
    label,
    hint,
    error,
    placeholder = "Search",
    id,
    className,
    disabled,
    onKeyDown,
    ...rest
  },
  ref,
) {
  const fieldId = useStableId(id, "search");
  const [query, setQuery] = useControllable<string>(value, defaultValue, onChange);
  const searchRef = useRef(onSearch);
  searchRef.current = onSearch;

  const fire = useMemo(
    () => debounce((next: string) => searchRef.current?.(next), debounceMs),
    [debounceMs],
  );
  useEffect(() => () => fire.cancel(), [fire]);

  const flush = (next: string): void => {
    fire.cancel();
    searchRef.current?.(next);
  };

  return (
    <FieldShell label={label} hint={hint} error={error} id={fieldId}>
      {({ id: controlId, describedBy }) => (
        <div className={classes("lac-search", className)} data-size={size}>
          <span className="lac-search-icon" aria-hidden>
            {icon ?? SearchIcon}
          </span>
          <input
            {...rest}
            ref={ref}
            id={controlId}
            aria-describedby={describedBy}
            className="lac-search-input"
            type="search"
            role="searchbox"
            placeholder={placeholder}
            disabled={disabled}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              fire(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") flush(query);
              if (event.key === "Escape" && query) {
                setQuery("");
                flush("");
              }
              onKeyDown?.(event);
            }}
          />
          {clearable && query !== "" && !disabled && (
            <button
              type="button"
              className="lac-search-clear"
              aria-label={clearLabel}
              onClick={() => {
                setQuery("");
                flush("");
              }}
            >
              <span aria-hidden>×</span>
            </button>
          )}
        </div>
      )}
    </FieldShell>
  );
});

/* ==========================================================================
   PasswordInput
   ========================================================================== */

export interface PasswordInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "size" | "type"> {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Show the strength meter under the field. */
  strength?: boolean;
  /** Swap in your own scorer — a zxcvbn wrapper, a server rule, anything. */
  scorer?: (password: string) => PasswordStrength;
  /** List the top suggestion under the meter. */
  showSuggestions?: boolean;
  size?: Size;
  invalid?: boolean;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  showLabel?: string;
  hideLabel?: string;
}

const EyeIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
    <path
      d="M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4S1.5 8 1.5 8Z"
      stroke="currentColor"
      strokeWidth="1.4"
    />
    <circle cx="8" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

const EyeOffIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
    <path
      d="M1.5 8s2.4-4 6.5-4c1.2 0 2.2.3 3.1.8M14.5 8s-2.4 4-6.5 4c-1.2 0-2.2-.3-3.1-.8"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
    <path d="m2.5 2.5 11 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

/**
 * A password field with a show/hide toggle and an optional strength meter.
 *
 * The toggle is a real button inside the field, labelled and reachable by
 * keyboard, and the meter is fed by `scorePassword` — a pure function you can
 * test, reuse on the server, or replace outright via `scorer`.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(
    {
      value,
      defaultValue = "",
      onChange,
      strength = false,
      scorer,
      showSuggestions = false,
      size = "md",
      invalid,
      label,
      hint,
      error,
      showLabel = "Show password",
      hideLabel = "Hide password",
      id,
      className,
      style,
      disabled,
      autoComplete = "current-password",
      ...rest
    },
    ref,
  ) {
    const fieldId = useStableId(id, "password");
    const [password, setPassword] = useControllable<string>(value, defaultValue, onChange);
    const [shown, setShown] = useState(false);
    const meter = useMemo(
      () => (strength ? (scorer ?? scorePassword)(password) : null),
      [strength, scorer, password],
    );
    const meterId = `${fieldId}-strength`;

    return (
      <FieldShell label={label} hint={hint} error={error} id={fieldId}>
        {({ id: controlId, describedBy, invalid: fieldInvalid }) => (
          <div className={classes("lac-pwd", className)} data-size={size}>
            <div className="lac-pwd-row">
              <Input
                {...rest}
                ref={ref}
                id={controlId}
                size={size}
                invalid={invalid || fieldInvalid}
                autoComplete={autoComplete}
                disabled={disabled}
                type={shown ? "text" : "password"}
                value={password}
                aria-describedby={[describedBy, meter ? meterId : undefined]
                  .filter(Boolean)
                  .join(" ") || undefined}
                onChange={(event) => setPassword(event.target.value)}
                style={{ ["--lac-input-pad-right" as string]: "40px", ...style }}
              />
              <button
                type="button"
                className="lac-pwd-toggle"
                aria-label={shown ? hideLabel : showLabel}
                aria-pressed={shown}
                disabled={disabled}
                onClick={() => setShown((previous) => !previous)}
              >
                {shown ? EyeOffIcon : EyeIcon}
              </button>
            </div>
            {meter && (
              <div className="lac-pwd-meter" id={meterId} data-score={meter.score}>
                <div className="lac-pwd-meter-track">
                  <div className="lac-pwd-meter-bar" style={{ width: `${meter.percent}%` }} />
                </div>
                <span className="lac-pwd-meter-label" aria-live="polite">
                  {meter.label}
                  {showSuggestions && meter.suggestions[0] ? ` — ${meter.suggestions[0]}` : ""}
                </span>
              </div>
            )}
          </div>
        )}
      </FieldShell>
    );
  },
);

/* ==========================================================================
   FileDrop
   ========================================================================== */

export interface FileDropProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue"> {
  /** Controlled list of files. */
  value?: File[];
  defaultValue?: File[];
  onChange?: (files: File[]) => void;
  /** Told about everything that bounced, with a reason each. */
  onReject?: (rejections: FileRejection[]) => void;
  /** `<input accept>` syntax: `.pdf,image/*`. */
  accept?: string;
  multiple?: boolean;
  /** Per-file byte ceiling. */
  maxSize?: number;
  maxFiles?: number;
  disabled?: boolean;
  /** Main line inside the zone. */
  prompt?: ReactNode;
  /** Small print under it. Defaults to a summary of accept and maxSize. */
  hint?: ReactNode;
  /** Hide the list of picked files when you render your own. */
  showList?: boolean;
  removeLabel?: string;
  name?: string;
}

/**
 * Click-or-drop file picking.
 *
 * The zone is a real `<button>`, so Enter and Space open the picker without a
 * line of key handling, and everything that bounces comes back through
 * `onReject` with a reason — a drop zone that silently eats a 40 MB file is
 * worse than no drop zone.
 */
export const FileDrop = forwardRef<HTMLDivElement, FileDropProps>(function FileDrop(
  {
    value,
    defaultValue,
    onChange,
    onReject,
    accept,
    multiple = true,
    maxSize,
    maxFiles,
    disabled = false,
    prompt = "Drop files here, or click to choose",
    hint,
    showList = true,
    removeLabel = "Remove",
    name,
    className,
    ...rest
  },
  ref,
) {
  const emptyDefault = useRef<File[]>([]);
  const [files, setFiles] = useControllable<File[]>(
    value,
    defaultValue ?? emptyDefault.current,
    onChange,
  );
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const statusId = useStableId(undefined, "filedrop");

  const add = (incoming: File[]): void => {
    const { accepted, rejected } = validateFiles(incoming, {
      accept,
      maxSize,
      multiple,
      maxFiles,
      existing: files,
    });
    if (accepted.length > 0) setFiles(multiple ? [...files, ...accepted] : accepted);
    if (rejected.length > 0) onReject?.(rejected);
  };

  const handleDrop = (event: ReactDragEvent<HTMLElement>): void => {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    add(Array.from(event.dataTransfer.files));
  };

  const defaultHint =
    hint ??
    [accept ? `Accepts ${accept}` : null, maxSize ? `up to ${formatBytes(maxSize)} each` : null]
      .filter(Boolean)
      .join(" · ");

  return (
    <div
      {...rest}
      ref={ref}
      className={classes("lac-filedrop", className)}
      data-disabled={disabled || undefined}
    >
      <button
        type="button"
        className="lac-filedrop-zone"
        data-dragging={dragging || undefined}
        disabled={disabled}
        aria-describedby={statusId}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <span className="lac-filedrop-prompt">{prompt}</span>
        {defaultHint && <span className="lac-filedrop-hint">{defaultHint}</span>}
      </button>
      <input
        ref={inputRef}
        className="lac-filedrop-native"
        type="file"
        name={name}
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          add(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <span className="lac-filedrop-status" id={statusId} aria-live="polite">
        {files.length === 0
          ? "No files selected"
          : `${files.length} file${files.length === 1 ? "" : "s"} selected`}
      </span>
      {showList && files.length > 0 && (
        <ul className="lac-filedrop-list">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}-${index}`} className="lac-filedrop-item">
              <span className="lac-filedrop-name">{file.name}</span>
              <span className="lac-filedrop-size">{formatBytes(file.size)}</span>
              <button
                type="button"
                className="lac-filedrop-remove"
                aria-label={`${removeLabel} ${file.name}`}
                disabled={disabled}
                onClick={() => setFiles(files.filter((_, at) => at !== index))}
              >
                <span aria-hidden>×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

/* ==========================================================================
   ColorInput
   ========================================================================== */

export interface ColorInputProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue"> {
  /** Controlled colour, any hex form. Emitted normalised as `#rrggbb`. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** A row of one-click swatches. */
  presets?: string[];
  disabled?: boolean;
  invalid?: boolean;
  size?: Size;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  swatchLabel?: string;
  name?: string;
}

/**
 * A native colour swatch beside a hex field, kept in sync both ways.
 *
 * The text field accepts anything hex-shaped — `abc`, `#ABC`, `#aabbcc` — and
 * only commits once it parses, so half-typed values never flash a wrong colour
 * across the page. On blur an unparseable value snaps back.
 */
export const ColorInput = forwardRef<HTMLInputElement, ColorInputProps>(function ColorInput(
  {
    value,
    defaultValue = "#000000",
    onChange,
    presets,
    disabled = false,
    invalid,
    size = "md",
    label,
    hint,
    error,
    swatchLabel = "Pick a colour",
    name,
    id,
    className,
    ...rest
  },
  ref,
) {
  const fieldId = useStableId(id, "color");
  const [color, setColor] = useControllable<string>(value, defaultValue, onChange);
  const [text, setText] = useState(() => normalizeHex(color) ?? color);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (dirty) return;
    setText(normalizeHex(color) ?? color);
  }, [color, dirty]);

  const commit = (next: string): void => {
    const normalized = normalizeHex(next);
    if (!normalized) return;
    setColor(normalized);
  };

  const badHex = text.trim() !== "" && !isValidHex(text);

  return (
    <FieldShell label={label} hint={hint} error={error} id={fieldId}>
      {({ id: controlId, describedBy, invalid: fieldInvalid }) => (
        <div
          {...rest}
          className={classes("lac-color", className)}
          data-size={size}
          data-disabled={disabled || undefined}
        >
          <span className="lac-color-row">
            <input
              className="lac-color-swatch"
              type="color"
              aria-label={swatchLabel}
              disabled={disabled}
              value={hexWithoutAlpha(color)}
              onChange={(event) => {
                setDirty(false);
                setText(event.target.value);
                commit(event.target.value);
              }}
            />
            <input
              ref={ref}
              id={controlId}
              className="lac-color-text"
              type="text"
              inputMode="text"
              spellCheck={false}
              autoComplete="off"
              disabled={disabled}
              aria-describedby={describedBy}
              aria-invalid={invalid || fieldInvalid || badHex || undefined}
              data-invalid={invalid || fieldInvalid || badHex || undefined}
              value={text}
              onChange={(event) => {
                setDirty(true);
                setText(event.target.value);
                commit(event.target.value);
              }}
              onBlur={() => {
                setDirty(false);
                setText(normalizeHex(text) ?? normalizeHex(color) ?? color);
              }}
            />
            {name && <input type="hidden" name={name} value={color} />}
          </span>
          {presets && presets.length > 0 && (
            <span className="lac-color-presets" role="group" aria-label="Preset colours">
              {presets.map((preset) => {
                const normalized = normalizeHex(preset) ?? preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    className="lac-color-preset"
                    style={{ background: normalized }}
                    aria-label={normalized}
                    aria-pressed={normalizeHex(color) === normalized}
                    disabled={disabled}
                    onClick={() => {
                      setDirty(false);
                      setText(normalized);
                      commit(normalized);
                    }}
                  />
                );
              })}
            </span>
          )}
        </div>
      )}
    </FieldShell>
  );
});

/* ==========================================================================
   RadioGroup / CheckboxGroup
   ========================================================================== */

/** One choice in a `RadioGroup` or `CheckboxGroup`. */
export interface ChoiceOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
  /** Secondary line under the label. */
  hint?: ReactNode;
}

export interface RadioGroupProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue"> {
  options: ChoiceOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Shared `name` for the radios. Generated when omitted. */
  name?: string;
  orientation?: "vertical" | "horizontal";
  disabled?: boolean;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
}

/**
 * Radios that share a name, wrapped in a real `role="radiogroup"`.
 *
 * They are native `<input type="radio">` elements, which is deliberate: the
 * browser already gives you arrow-key roving, form participation and the right
 * announcement. Re-implementing that with divs only ever loses.
 */
export const RadioGroup = forwardRef<HTMLDivElement, RadioGroupProps>(function RadioGroup(
  {
    options = [],
    value,
    defaultValue = "",
    onChange,
    name,
    orientation = "vertical",
    disabled = false,
    label,
    hint,
    error,
    required,
    id,
    className,
    ...rest
  },
  ref,
) {
  const groupId = useStableId(id, "radiogroup");
  const groupName = name ?? `${groupId}-name`;
  const [selected, setSelected] = useControllable<string>(value, defaultValue, onChange);
  const labelId = `${groupId}-label`;
  const errorId = `${groupId}-error`;

  return (
    <div
      {...rest}
      ref={ref}
      role="radiogroup"
      aria-labelledby={label != null ? labelId : undefined}
      aria-describedby={error != null ? errorId : undefined}
      aria-invalid={error != null || undefined}
      aria-required={required || undefined}
      className={classes("lac-choices", className)}
      data-orientation={orientation}
      data-disabled={disabled || undefined}
    >
      {label != null && (
        <span className="lac-choices-label" id={labelId} data-required={required || undefined}>
          {label}
        </span>
      )}
      <div className="lac-choices-list">
        {options.map((option) => (
          <span key={option.value} className="lac-choices-item">
            <Radio
              name={groupName}
              value={option.value}
              label={option.label}
              checked={selected === option.value}
              disabled={disabled || option.disabled}
              onChange={() => setSelected(option.value)}
            />
            {option.hint != null && <span className="lac-choices-hint">{option.hint}</span>}
          </span>
        ))}
      </div>
      {error != null ? (
        <span className="lac-choices-error" id={errorId}>
          {error}
        </span>
      ) : (
        hint != null && <span className="lac-choices-hint">{hint}</span>
      )}
    </div>
  );
});

export interface CheckboxGroupProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue"> {
  options: ChoiceOption[];
  /** Controlled selection, in the order it was made. */
  value?: string[];
  defaultValue?: string[];
  onChange?: (value: string[]) => void;
  name?: string;
  orientation?: "vertical" | "horizontal";
  /** Ignore ticks past this many. */
  max?: number;
  disabled?: boolean;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
}

/**
 * Checkboxes over one array value, with an optional ceiling.
 *
 * At `max` the unticked boxes are disabled rather than quietly ignoring the
 * click, so the limit is visible before it is hit.
 */
export const CheckboxGroup = forwardRef<HTMLDivElement, CheckboxGroupProps>(function CheckboxGroup(
  {
    options = [],
    value,
    defaultValue,
    onChange,
    name,
    orientation = "vertical",
    max,
    disabled = false,
    label,
    hint,
    error,
    required,
    id,
    className,
    ...rest
  },
  ref,
) {
  const groupId = useStableId(id, "checkboxgroup");
  const emptyDefault = useRef<string[]>([]);
  const [selected, setSelected] = useControllable<string[]>(
    value,
    defaultValue ?? emptyDefault.current,
    onChange,
  );
  const labelId = `${groupId}-label`;
  const errorId = `${groupId}-error`;
  const full = max !== undefined && selected.length >= max;

  return (
    <div
      {...rest}
      ref={ref}
      role="group"
      aria-labelledby={label != null ? labelId : undefined}
      aria-describedby={error != null ? errorId : undefined}
      aria-invalid={error != null || undefined}
      aria-required={required || undefined}
      className={classes("lac-choices", className)}
      data-orientation={orientation}
      data-disabled={disabled || undefined}
    >
      {label != null && (
        <span className="lac-choices-label" id={labelId} data-required={required || undefined}>
          {label}
        </span>
      )}
      <div className="lac-choices-list">
        {options.map((option) => {
          const checked = selected.includes(option.value);
          return (
            <span key={option.value} className="lac-choices-item">
              <Checkbox
                name={name}
                value={option.value}
                label={option.label}
                checked={checked}
                disabled={disabled || option.disabled || (full && !checked)}
                onChange={() =>
                  setSelected(toggleSelection(selected, option.value, { multiple: true, max }))
                }
              />
              {option.hint != null && <span className="lac-choices-hint">{option.hint}</span>}
            </span>
          );
        })}
      </div>
      {error != null ? (
        <span className="lac-choices-error" id={errorId}>
          {error}
        </span>
      ) : (
        hint != null && <span className="lac-choices-hint">{hint}</span>
      )}
    </div>
  );
});

/* ==========================================================================
   ToggleGroup
   ========================================================================== */

/** One segment of a `ToggleGroup`. */
export interface ToggleGroupItem {
  value: string;
  label?: ReactNode;
  icon?: ReactNode;
  /** Required when the segment is icon-only — an icon alone has no name. */
  ariaLabel?: string;
  disabled?: boolean;
}

export interface ToggleGroupProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue"> {
  items: ToggleGroupItem[];
  /** One at a time, or many. */
  type?: "single" | "multiple";
  /**
   * Always an array, in both modes — one shape to handle, and `single` is just
   * `multiple` with a maximum of one.
   */
  value?: string[];
  defaultValue?: string[];
  onChange?: (value: string[]) => void;
  /** May the selected segment be clicked off in `single` mode? */
  allowDeselect?: boolean;
  /** Ceiling in `multiple` mode. */
  max?: number;
  size?: Size;
  /** Stretch the segments to fill the row. */
  full?: boolean;
  disabled?: boolean;
  /** Accessible name for the group. */
  label?: string;
}

/**
 * A segmented control.
 *
 * In `single` mode the segments are radios (arrow keys move and select, one
 * tab stop for the group); in `multiple` mode they are toggle buttons with
 * `aria-pressed`. Same component, correct semantics for each.
 */
export const ToggleGroup = forwardRef<HTMLDivElement, ToggleGroupProps>(function ToggleGroup(
  {
    items = [],
    type = "single",
    value,
    defaultValue,
    onChange,
    allowDeselect = false,
    max,
    size = "md",
    full = false,
    disabled = false,
    label,
    className,
    ...rest
  },
  ref,
) {
  const emptyDefault = useRef<string[]>([]);
  const [selected, setSelected] = useControllable<string[]>(
    value,
    defaultValue ?? emptyDefault.current,
    onChange,
  );
  const rootRef = useRef<HTMLDivElement | null>(null);
  const multiple = type === "multiple";

  const setRoot = (node: HTMLDivElement | null): void => {
    rootRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as { current: HTMLDivElement | null }).current = node;
  };

  const pick = (item: ToggleGroupItem): void => {
    if (disabled || item.disabled) return;
    setSelected(toggleSelection(selected, item.value, { multiple, allowDeselect, max }));
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (multiple) return;
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const root = rootRef.current;
    if (!root) return;
    const buttons = Array.from(
      root.querySelectorAll<HTMLButtonElement>("button.lac-toggle-item:not([disabled])"),
    );
    if (buttons.length === 0) return;
    event.preventDefault();
    const current = buttons.findIndex((button) => button === document.activeElement);
    let next: number;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = buttons.length - 1;
    else {
      const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
      next = moveHighlight(current, delta, buttons.length);
    }
    const target = buttons[next];
    if (!target) return;
    target.focus();
    target.click();
  };

  const firstEnabled = items.findIndex((item) => !item.disabled);

  return (
    <div
      {...rest}
      ref={setRoot}
      role={multiple ? "group" : "radiogroup"}
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={classes("lac-toggle", className)}
      data-size={size}
      data-full={full || undefined}
      data-disabled={disabled || undefined}
      onKeyDown={handleKeyDown}
    >
      {items.map((item, index) => {
        const active = selected.includes(item.value);
        const tabbable = multiple || active || (selected.length === 0 && index === firstEnabled);
        return (
          <button
            key={item.value}
            type="button"
            className="lac-toggle-item"
            role={multiple ? undefined : "radio"}
            aria-checked={multiple ? undefined : active}
            aria-pressed={multiple ? active : undefined}
            aria-label={item.ariaLabel}
            disabled={disabled || item.disabled}
            tabIndex={tabbable ? 0 : -1}
            data-active={active || undefined}
            onClick={() => pick(item)}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
});

/* ==========================================================================
   Fieldset
   ========================================================================== */

export interface FieldsetProps extends FieldsetHTMLAttributes<HTMLFieldSetElement> {
  /** The group's heading. Rendered as a real `<legend>`. */
  legend?: ReactNode;
  /** Guidance for the whole group. */
  hint?: ReactNode;
  /** One error covering the group, wired up with `aria-describedby`. */
  error?: ReactNode;
  children?: ReactNode;
}

/**
 * A real `<fieldset>` with a `<legend>`, a shared hint and a shared error.
 *
 * Native `disabled` on a fieldset disables every control inside it for free —
 * worth having over a styled div the moment a form has a section that switches
 * off.
 */
export const Fieldset = forwardRef<HTMLFieldSetElement, FieldsetProps>(function Fieldset(
  { legend, hint, error, children, className, id, ...rest },
  ref,
) {
  const baseId = useStableId(id, "fieldset");
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;
  const invalid = error != null;

  return (
    <fieldset
      {...rest}
      ref={ref}
      id={baseId}
      className={classes("lac-fieldset", className)}
      data-invalid={invalid || undefined}
      aria-describedby={invalid ? errorId : hint != null ? hintId : undefined}
    >
      {legend != null && <legend className="lac-fieldset-legend">{legend}</legend>}
      {!invalid && hint != null && (
        <span className="lac lac-hint" id={hintId}>
          {hint}
        </span>
      )}
      <div className="lac-fieldset-body">{children}</div>
      {invalid && (
        <span className="lac lac-error" id={errorId}>
          {error}
        </span>
      )}
    </fieldset>
  );
});
