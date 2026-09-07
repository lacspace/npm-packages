/**
 * Additional coercers for @lacspace/env — duration, bytes, list/array, enum,
 * host, and integer variants. All zero-dependency, isomorphic, and returning the
 * same {@link Validator} shape (with `.describe()` / `.example()` / `.secret()`)
 * as the core coercers in `index.ts`.
 */

import { type BaseOpts, type Validator, coerce, oneOf, raise, str } from "./index";

const DURATION_UNITS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/**
 * A human duration string → **milliseconds**. Accepts `ms` `s` `m` `h` `d` `w`
 * (e.g. `"30s"`, `"5m"`, `"1h"`, `"1.5d"`); a bare number is treated as ms.
 */
export function duration(opts?: BaseOpts<number>): Validator<number> {
  return coerce(
    "duration",
    (v, key) => {
      const m = /^(-?\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)?$/i.exec(v.trim());
      if (!m) raise(key, `must be a duration like "30s", "5m", "1h", got "${v}"`);
      const n = parseFloat(m[1]!);
      const unit = (m[2] ?? "ms").toLowerCase();
      return Math.round(n * DURATION_UNITS[unit]!);
    },
    opts,
  );
}

const BYTE_UNITS: Record<string, number> = {
  b: 1,
  kb: 1024,
  mb: 1024 ** 2,
  gb: 1024 ** 3,
  tb: 1024 ** 4,
  pb: 1024 ** 5,
};

/**
 * A human byte-size string → **number of bytes** (1024-based). Accepts
 * `b` `kb` `mb` `gb` `tb` `pb` (and the `kib`/`mib`… aliases), e.g. `"10mb"`,
 * `"512kb"`; a bare number is treated as bytes.
 */
export function bytes(opts?: BaseOpts<number>): Validator<number> {
  return coerce(
    "bytes",
    (v, key) => {
      const m = /^(-?\d+(?:\.\d+)?)\s*(b|kb|mb|gb|tb|pb|kib|mib|gib|tib|pib)?$/i.exec(v.trim());
      if (!m) raise(key, `must be a byte size like "10mb", "512kb", got "${v}"`);
      const n = parseFloat(m[1]!);
      const unit = (m[2] ?? "b").toLowerCase().replace("ib", "b");
      return Math.round(n * BYTE_UNITS[unit]!);
    },
    opts,
  );
}

/**
 * A comma-separated list. Each item is parsed with `item` (defaults to {@link str}),
 * so `list(port())` yields a validated `number[]`. `separator` defaults to `","`.
 * @example
 * ORIGINS: list(url()),                 // string[] of URLs
 * WORKER_PORTS: list(port(), { separator: " " }),
 */
export function list<T = string>(
  item?: Validator<T>,
  opts?: BaseOpts<T[]> & { separator?: string },
): Validator<T[]> {
  const el = item ?? (str() as unknown as Validator<T>);
  const sep = opts?.separator ?? ",";
  return coerce(
    "list",
    (v, key) =>
      v
        .split(sep)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s, i) => el.parse(s, `${key}[${i}]`)),
    opts,
  );
}

/** Alias of {@link list}. */
export const array = list;

/**
 * One of a fixed set of values, variadic form — `enums("a", "b", "c")`.
 * (`enum` is a reserved word, so the export is named `enums`; use {@link oneOf}
 * when you need `default`/`optional`.)
 */
export function enums<const T extends string>(...values: T[]): Validator<T> {
  return oneOf(values);
}

/**
 * A network host — hostname, IPv4, IPv6 (`[::1]`), or `localhost`, with an
 * optional `:port` suffix. Rejects URLs (anything containing `://`) and whitespace.
 */
export function host(opts?: BaseOpts<string>): Validator<string> {
  return coerce(
    "host",
    (v, key) => {
      const s = v.trim();
      if (!s || /\s/.test(s) || s.includes("://")) raise(key, `must be a host, got "${v}"`);
      let hostPart = s;
      let portPart: string | undefined;
      const ipv6 = /^\[([^\]]+)\](?::(\d+))?$/.exec(s);
      if (ipv6) {
        hostPart = ipv6[1]!;
        portPart = ipv6[2];
      } else if ((s.match(/:/g) ?? []).length === 1) {
        const idx = s.indexOf(":");
        hostPart = s.slice(0, idx);
        portPart = s.slice(idx + 1);
      }
      if (portPart !== undefined && !/^\d{1,5}$/.test(portPart))
        raise(key, `has an invalid port, got "${v}"`);
      const ok =
        hostPart === "localhost" ||
        /^\d{1,3}(\.\d{1,3}){3}$/.test(hostPart) ||
        /^[0-9a-fA-F:]+$/.test(hostPart) ||
        /^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*$/.test(
          hostPart,
        );
      if (!ok) raise(key, `must be a host, got "${v}"`);
      return s;
    },
    opts,
  );
}
