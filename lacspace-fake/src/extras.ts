/**
 * Extra field generators added in 0.2.0. Each is a pure function of the shared
 * `GenContext` (RNG + locale + row) and stays byte-deterministic under a seed —
 * no clock, no network. These are merged into the main `generators` registry in
 * `generators.ts`, so they are reachable from the CLI, `--fields`, JSON schemas
 * and `generateValues` exactly like the built-ins.
 */
import type { Generator, GenContext, GenArg } from "./generators.js";
import { LOCALES } from "./data.js";

function num(a: GenArg | undefined, fallback: number): number {
  if (a === undefined) return fallback;
  const n = typeof a === "number" ? a : Number(a);
  return Number.isFinite(n) ? n : fallback;
}

// Crockford base32 (no I, L, O, U) — the ULID alphabet.
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const MIME_TYPES = [
  "application/json", "application/pdf", "application/zip", "application/xml",
  "text/plain", "text/html", "text/csv", "text/markdown",
  "image/png", "image/jpeg", "image/gif", "image/svg+xml", "image/webp",
  "audio/mpeg", "video/mp4", "application/octet-stream",
  "application/vnd.ms-excel", "font/woff2",
];

export const FILE_EXTS = ["txt", "md", "json", "csv", "pdf", "png", "jpg", "svg", "zip", "log", "yaml", "ts", "js", "html", "xml"];

export const DIR_WORDS = ["home", "usr", "var", "opt", "srv", "data", "assets", "public", "src", "tmp", "docs", "config", "logs", "media", "shared"];

export const TIMEZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Los_Angeles", "America/Sao_Paulo",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Moscow",
  "Asia/Kathmandu", "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo",
  "Asia/Shanghai", "Australia/Sydney", "Pacific/Auckland", "Africa/Johannesburg", "Africa/Cairo",
];

export const CURRENCY_CODES = ["USD", "EUR", "GBP", "JPY", "INR", "NPR", "CNY", "AUD", "CAD", "CHF", "BRL", "ZAR", "SGD", "AED"];

export const COUNTRY_CODES = ["US", "GB", "FR", "DE", "ES", "IT", "NP", "IN", "JP", "CN", "BR", "CA", "AU", "ZA", "SG", "AE", "MX", "NL"];

// Card networks and their IIN prefixes (used only for a masked display value).
const CARD_BRANDS: { name: string; prefix: string; len: number }[] = [
  { name: "Visa", prefix: "4", len: 16 },
  { name: "Mastercard", prefix: "5", len: 16 },
  { name: "Amex", prefix: "3", len: 15 },
  { name: "Discover", prefix: "6", len: 16 },
];

function hexColor(ctx: GenContext): string {
  return `#${ctx.rng.hex(6)}`;
}

export const extraGenerators: Record<string, Generator> = {
  // A 26-char Crockford-base32 ULID shape, fully seed-derived (deterministic).
  ulid: (ctx) => ctx.rng.chars(CROCKFORD, 26),

  // Colours
  hexColor: (ctx) => hexColor(ctx),
  hex: (ctx) => hexColor(ctx),
  rgb: (ctx) => `rgb(${ctx.rng.int(0, 255)}, ${ctx.rng.int(0, 255)}, ${ctx.rng.int(0, 255)})`,
  hsl: (ctx) => `hsl(${ctx.rng.int(0, 359)}, ${ctx.rng.int(0, 100)}%, ${ctx.rng.int(0, 100)}%)`,

  // Versioning
  semver: (ctx, a) => `${ctx.rng.int(num(a[0], 0), num(a[1], 9))}.${ctx.rng.int(0, 20)}.${ctx.rng.int(0, 40)}`,

  // Files & content types
  mimeType: (ctx) => ctx.rng.pick(MIME_TYPES),
  fileExt: (ctx) => ctx.rng.pick(FILE_EXTS),
  fileName: (ctx) => `${ctx.rng.chars("abcdefghijklmnopqrstuvwxyz0123456789-_", ctx.rng.int(4, 12))}.${ctx.rng.pick(FILE_EXTS)}`,
  filePath: (ctx) => {
    const depth = ctx.rng.int(1, 3);
    const dirs = Array.from({ length: depth }, () => ctx.rng.pick(DIR_WORDS));
    const name = `${ctx.rng.chars("abcdefghijklmnopqrstuvwxyz0123456789-_", ctx.rng.int(3, 10))}.${ctx.rng.pick(FILE_EXTS)}`;
    return `/${dirs.join("/")}/${name}`;
  },

  // Time zones & codes
  timezone: (ctx) => ctx.rng.pick(TIMEZONES),
  currencyCode: (ctx) => ctx.rng.pick(CURRENCY_CODES),

  // Finance (masked / structurally-valid-looking, never real)
  creditCardMasked: (ctx) => {
    const brand = ctx.rng.pick(CARD_BRANDS);
    const last4 = ctx.rng.digits(4);
    const groups = brand.len === 15 ? ["****", "******", "*" + last4] : ["****", "****", "****", last4];
    return groups.join(" ");
  },
  creditCard: (ctx) => extraGenerators["creditCardMasked"]!(ctx, []),
  cardBrand: (ctx) => ctx.rng.pick(CARD_BRANDS).name,
  iban: (ctx) => {
    const cc = LOCALES[ctx.locale].countryCode;
    const check = ctx.rng.digits(2);
    const bban = ctx.rng.chars("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 16);
    return `${cc}${check}${bban}`;
  },
  bic: (ctx) => `${ctx.rng.chars("ABCDEFGHIJKLMNOPQRSTUVWXYZ", 4)}${LOCALES[ctx.locale].countryCode}${ctx.rng.chars("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 2)}`,
};

/** Names of the 0.2.0 generators, appended to `GEN_ORDER` for `list`. */
export const EXTRA_GEN_ORDER: string[] = [
  "ulid", "hexColor", "rgb", "hsl", "semver",
  "mimeType", "fileExt", "fileName", "filePath",
  "timezone", "currencyCode",
  "creditCardMasked", "cardBrand", "iban", "bic",
];
