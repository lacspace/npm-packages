/**
 * @lacspace/redact — deep object redaction & formatter integration
 *
 * `redactObject` is a hardened, cycle-safe, configurable deep redactor built on
 * the extended {@link DETECTORS} set. It is a pure function (no logger
 * dependency) so you can wrap any serializer/logger with it. It NEVER throws on
 * weird input (circular refs, symbols, bigint, functions, throwing getters).
 *
 * This is ADDITIVE — the original {@link redact}/{@link redactString} exports are
 * untouched and keep their exact behaviour and defaults.
 *
 * Zero dependencies · isomorphic · fully typed.
 */

import { SENSITIVE_KEYS } from "./index";
import {
  DETECTOR_MAP,
  DETECTOR_NAMES,
  type Detector,
  type DetectorName,
} from "./detectors";

/** A user-supplied pattern with a custom replacement. */
export interface CustomPattern {
  /** Optional name (for `replacer`'s second arg). */
  name?: string;
  /** The regex to match (should carry the `g` flag; one is added if missing). */
  pattern: RegExp;
  /** Replacement string or function. Falls back to `mask` when omitted. */
  replace?: string | ((match: string) => string);
}

/** Partial-masking config (keep the last N characters visible). */
export interface PartialMaskOptions {
  /** How many trailing characters to keep. Default 4. */
  keepEnd?: number;
  /** Character to mask with. Default "*". */
  maskChar?: string;
}

export interface RedactObjectOptions {
  /** Replacement for values masked by KEY. Default "[REDACTED]". */
  mask?: string;
  /** Extra sensitive key names (case-insensitive) to add to the denylist. */
  keys?: string[];
  /** Keys to FORCE-KEEP even if they'd otherwise match the denylist. */
  keyAllowlist?: string[];
  /**
   * Which value detectors to run. Omit for ALL detectors. Pass an array to
   * whitelist, or a map like `{ email: true, ipv4: false }` to toggle.
   */
  detectors?: DetectorName[] | Partial<Record<DetectorName, boolean>>;
  /** Extra user regex patterns applied to every string value. */
  customPatterns?: CustomPattern[];
  /**
   * Global custom replacer for detector/customPattern matches.
   * `(match, name) => string`. Overrides the per-detector default replacement.
   */
  replacer?: (match: string, name: string) => string;
  /**
   * Partial masking (keep last N visible) instead of full redaction for
   * value-pattern matches. `true` uses defaults; or pass options.
   */
  partial?: boolean | PartialMaskOptions;
  /** Max recursion depth. Default 8. */
  maxDepth?: number;
  /** Also pattern-scrub plain string values (not just key-masked). Default true. */
  scrubStrings?: boolean;
}

const CIRCULAR = "[Circular]";

function resolveDetectors(
  detectors: RedactObjectOptions["detectors"],
): Detector[] {
  if (!detectors) return DETECTOR_NAMES.map((n) => DETECTOR_MAP[n]);
  if (Array.isArray(detectors)) {
    return detectors
      .filter((n): n is DetectorName => n in DETECTOR_MAP)
      .map((n) => DETECTOR_MAP[n]);
  }
  return DETECTOR_NAMES.filter((n) => detectors[n] !== false).map(
    (n) => DETECTOR_MAP[n],
  );
}

function keyMatches(key: string, list: string[]): boolean {
  const k = key.toLowerCase().replace(/[_-]/g, "");
  return list.some((s) => k.includes(s.toLowerCase().replace(/[_-]/g, "")));
}

/**
 * Scrub a single string using the enhanced detector set + custom patterns.
 * Never throws.
 */
export function scrubString(input: string, opts: RedactObjectOptions = {}): string {
  let out = String(input);
  const pm: PartialMaskOptions = typeof opts.partial === "object" ? opts.partial : {};
  const ctx = {
    partial: !!opts.partial,
    keepEnd: pm.keepEnd ?? 4,
    maskChar: pm.maskChar ?? "*",
  };
  const dets = resolveDetectors(opts.detectors);

  for (const d of dets) {
    try {
      const re = new RegExp(d.re.source, d.re.flags.includes("g") ? d.re.flags : d.re.flags + "g");
      out = out.replace(re, (m) => {
        try {
          if (d.validate && !d.validate(m)) return m; // near-miss → leave alone
          if (opts.replacer) return opts.replacer(m, d.name);
          if (ctx.partial && d.partial) return d.partial(m, ctx);
          return d.replace(m);
        } catch {
          return m;
        }
      });
    } catch {
      /* a bad detector regex must never break redaction */
    }
  }

  for (const cp of opts.customPatterns ?? []) {
    try {
      const src = cp.pattern.source;
      const flags = cp.pattern.flags.includes("g") ? cp.pattern.flags : cp.pattern.flags + "g";
      const re = new RegExp(src, flags);
      out = out.replace(re, (m) => {
        try {
          if (opts.replacer) return opts.replacer(m, cp.name ?? "custom");
          if (typeof cp.replace === "function") return cp.replace(m);
          if (typeof cp.replace === "string") return cp.replace;
          return opts.mask ?? "[REDACTED]";
        } catch {
          return m;
        }
      });
    } catch {
      /* ignore bad custom regex */
    }
  }

  return out;
}

/**
 * Deeply redact a string or (plain) object/array. Values under sensitive keys
 * are fully masked; string values are pattern-scrubbed with the extended
 * detectors. Cycle-safe (WeakSet), depth-bounded, and guaranteed not to throw
 * on circular refs, symbols, bigint, functions or throwing getters.
 *
 * Pure — no logger dependency. Wrap your serializer with it:
 *   `logger.info(redactObject(ctx))`.
 */
export function redactObject<T>(input: T, opts: RedactObjectOptions = {}): T {
  const mask = opts.mask ?? "[REDACTED]";
  const maxDepth = opts.maxDepth ?? 8;
  const scrub = opts.scrubStrings !== false;
  const denyKeys = [...SENSITIVE_KEYS, ...(opts.keys ?? [])];
  const allowKeys = opts.keyAllowlist ?? [];

  const walk = (val: unknown, depth: number, seen: WeakSet<object>, keyName?: string): unknown => {
    try {
      if (keyName !== undefined) {
        if (allowKeys.length && keyMatches(keyName, allowKeys)) {
          // force-keep: still scrub strings for pattern leaks
          if (typeof val === "string") return scrub ? scrubString(val, opts) : val;
        } else if (keyMatches(keyName, denyKeys)) {
          return mask;
        }
      }

      if (typeof val === "string") return scrub ? scrubString(val, opts) : val;
      // primitives & non-plain values (number, bigint, boolean, symbol,
      // function, null, undefined) pass through untouched.
      if (val === null || typeof val !== "object") return val;

      if (depth >= maxDepth) return val;

      if (seen.has(val)) return CIRCULAR;
      seen.add(val);

      try {
        if (Array.isArray(val)) {
          return val.map((v) => walk(v, depth + 1, seen));
        }
        // Only recurse into plain objects; preserve Date/Map/Set/Buffer/etc.
        const proto = Object.getPrototypeOf(val);
        if (proto !== null && proto !== Object.prototype) return val;

        const out: Record<string, unknown> = {};
        for (const k of Object.keys(val as Record<string, unknown>)) {
          try {
            out[k] = walk((val as Record<string, unknown>)[k], depth + 1, seen, k);
          } catch {
            out[k] = "[unserializable]";
          }
        }
        return out;
      } finally {
        seen.delete(val);
      }
    } catch {
      return "[unserializable]";
    }
  };

  try {
    return walk(input, 0, new WeakSet<object>()) as T;
  } catch {
    return input;
  }
}

/** Bind {@link redactObject} options once and reuse (e.g. as a logger serializer). */
export function createObjectRedactor(opts: RedactObjectOptions = {}) {
  return <T>(input: T): T => redactObject(input, opts);
}
