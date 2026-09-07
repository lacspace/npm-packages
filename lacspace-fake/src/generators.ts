/**
 * The generator library. Each generator is a pure function of a `GenContext`
 * (an RNG + locale + row index + the partially-built row) and an optional list
 * of positional args. Generators are looked up by name from the `generators`
 * registry, which powers the CLI, the schema engine and the `list` command.
 */
import type { RNG } from "./prng.js";
import type { Locale, LocaleData } from "./data.js";
import {
  LOCALES,
  LOREM_WORDS,
  EMAIL_DOMAINS,
  URL_TLDS,
  COMPANY_PREFIXES,
  COMPANY_ROOTS,
  COMPANY_SUFFIXES,
  BUZZ_ADJ,
  BUZZ_NOUN,
  BUZZ_VERB,
  JOB_LEVELS,
  JOB_ROLES,
  DEPARTMENTS,
  PRODUCT_ADJ,
  PRODUCT_MATERIAL,
  PRODUCT_NOUN,
  PRODUCT_CATEGORIES,
  COLORS,
} from "./data.js";
import { extraGenerators, EXTRA_GEN_ORDER } from "./extras.js";

export interface GenContext {
  rng: RNG;
  locale: Locale;
  /** Zero-based row index — used by `autoincrement`. */
  index: number;
  /** The row built so far; lets `email` derive from an earlier `firstName`. */
  row: Record<string, unknown>;
}

export type GenArg = string | number;
export type Generator = (ctx: GenContext, args: GenArg[]) => unknown;

function data(ctx: GenContext): LocaleData {
  return LOCALES[ctx.locale];
}

function num(a: GenArg | undefined, fallback: number): number {
  if (a === undefined) return fallback;
  const n = typeof a === "number" ? a : Number(a);
  return Number.isFinite(n) ? n : fallback;
}

function str(a: GenArg | undefined, fallback = ""): string {
  return a === undefined ? fallback : String(a);
}

/** Strip accents/spaces/punctuation to a lowercase URL slug. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}

// --- name helpers ---------------------------------------------------------

function pickFirstName(ctx: GenContext, gender?: "male" | "female"): string {
  const d = data(ctx);
  const g = gender ?? (ctx.rng.bool() ? "male" : "female");
  return ctx.rng.pick(g === "male" ? d.firstNamesMale : d.firstNamesFemale);
}

/** Resolve first/last names for the current row, reusing fields if present. */
function nameParts(ctx: GenContext): { first: string; last: string } {
  const d = data(ctx);
  const rowFirst = ctx.row["firstName"];
  const rowLast = ctx.row["lastName"];
  const first = typeof rowFirst === "string" && rowFirst ? rowFirst : pickFirstName(ctx);
  const last = typeof rowLast === "string" && rowLast ? rowLast : ctx.rng.pick(d.lastNames);
  return { first, last };
}

// --- text helpers ---------------------------------------------------------

function makeWords(ctx: GenContext, count: number): string {
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(ctx.rng.pick(LOREM_WORDS));
  return out.join(" ");
}

function makeSentence(ctx: GenContext, words?: number): string {
  const n = words ?? ctx.rng.int(6, 14);
  return capitalize(makeWords(ctx, n)) + ".";
}

function makeParagraph(ctx: GenContext, sentences?: number): string {
  const n = sentences ?? ctx.rng.int(3, 6);
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(makeSentence(ctx));
  return out.join(" ");
}

// --- datetime helpers -----------------------------------------------------

const DAY_MS = 86_400_000;

function isoOf(ms: number): string {
  return new Date(ms).toISOString();
}

// --- the registry ---------------------------------------------------------

export const generators: Record<string, Generator> = {
  // person
  firstName: (ctx, a) => pickFirstName(ctx, a[0] === "male" || a[0] === "female" ? (a[0] as "male" | "female") : undefined),
  lastName: (ctx) => ctx.rng.pick(data(ctx).lastNames),
  fullName: (ctx) => {
    const { first, last } = nameParts(ctx);
    return `${first} ${last}`;
  },
  name: (ctx) => generators["fullName"]!(ctx, []),
  gender: (ctx) => ctx.rng.pick(["male", "female"]),
  age: (ctx, a) => ctx.rng.int(num(a[0], 18), num(a[1], 80)),
  dateOfBirth: (ctx, a) => {
    const minAge = num(a[0], 18);
    const maxAge = num(a[1], 80);
    const years = ctx.rng.int(minAge, maxAge);
    const ms = Date.now() - years * 365.25 * DAY_MS - ctx.rng.int(0, 364) * DAY_MS;
    return isoOf(ms).slice(0, 10);
  },
  dob: (ctx, a) => generators["dateOfBirth"]!(ctx, a),

  // internet
  username: (ctx) => {
    const { first, last } = nameParts(ctx);
    const sep = ctx.rng.pick(["", ".", "_"]);
    const tail = ctx.rng.bool(0.6) ? String(ctx.rng.int(1, 999)) : "";
    return `${first.toLowerCase()}${sep}${last.toLowerCase()}${tail}`;
  },
  email: (ctx, a) => {
    const { first, last } = nameParts(ctx);
    const rowUser = ctx.row["username"];
    const localBase =
      typeof rowUser === "string" && rowUser
        ? rowUser
        : `${first.toLowerCase()}${ctx.rng.pick([".", "_", ""])}${last.toLowerCase()}`;
    const suffix = ctx.rng.bool(0.5) ? String(ctx.rng.int(1, 99)) : "";
    const domain = a[0] !== undefined ? str(a[0]) : ctx.rng.pick(EMAIL_DOMAINS);
    return `${slugify(localBase).replace(/-/g, ".")}${suffix}@${domain}`;
  },
  domain: (ctx) => `${ctx.rng.pick(COMPANY_ROOTS)}${ctx.rng.pick(COMPANY_ROOTS)}.${ctx.rng.pick(URL_TLDS)}`,
  url: (ctx) => `https://${ctx.rng.pick(COMPANY_ROOTS)}${ctx.rng.pick(COMPANY_ROOTS)}.${ctx.rng.pick(URL_TLDS)}`,
  slug: (ctx, a) => {
    const words = num(a[0], ctx.rng.int(2, 4));
    return slugify(makeWords(ctx, words));
  },
  ipv4: (ctx) => `${ctx.rng.int(1, 255)}.${ctx.rng.int(0, 255)}.${ctx.rng.int(0, 255)}.${ctx.rng.int(1, 254)}`,
  ipv6: (ctx) => Array.from({ length: 8 }, () => ctx.rng.hex(4)).join(":"),
  mac: (ctx) => Array.from({ length: 6 }, () => ctx.rng.hex(2)).join(":"),
  password: (ctx, a) => {
    const len = num(a[0], 12);
    return ctx.rng.chars("abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*", len);
  },
  uuid: (ctx) => ctx.rng.uuid(),

  // phone
  phone: (ctx) => data(ctx).phone(ctx.rng).e164,
  phoneLocal: (ctx) => data(ctx).phone(ctx.rng).local,

  // address
  street: (ctx) => {
    const d = data(ctx);
    return `${ctx.rng.int(1, 9999)} ${ctx.rng.pick(d.streetNames)} ${ctx.rng.pick(d.streetSuffixes)}`;
  },
  city: (ctx) => ctx.rng.pick(data(ctx).cities),
  state: (ctx) => ctx.rng.pick(data(ctx).states),
  province: (ctx) => ctx.rng.pick(data(ctx).states),
  country: (ctx) => data(ctx).country,
  countryCode: (ctx) => data(ctx).countryCode,
  zip: (ctx) => data(ctx).zip(ctx.rng),
  postalCode: (ctx) => data(ctx).zip(ctx.rng),
  address: (ctx) => {
    const d = data(ctx);
    const street = `${ctx.rng.int(1, 9999)} ${ctx.rng.pick(d.streetNames)} ${ctx.rng.pick(d.streetSuffixes)}`;
    return `${street}, ${ctx.rng.pick(d.cities)}, ${ctx.rng.pick(d.states)} ${d.zip(ctx.rng)}`;
  },
  latitude: (ctx) => ctx.rng.float(-90, 90, 6),
  longitude: (ctx) => ctx.rng.float(-180, 180, 6),
  latlng: (ctx) => `${ctx.rng.float(-90, 90, 6)},${ctx.rng.float(-180, 180, 6)}`,

  // company
  company: (ctx) => `${ctx.rng.pick(COMPANY_PREFIXES)}${ctx.rng.pick(COMPANY_ROOTS)} ${ctx.rng.pick(COMPANY_SUFFIXES)}`,
  catchphrase: (ctx) => capitalize(`${ctx.rng.pick(BUZZ_VERB)} ${ctx.rng.pick(BUZZ_ADJ)} ${ctx.rng.pick(BUZZ_NOUN)}`),
  jobTitle: (ctx) => `${ctx.rng.pick(JOB_LEVELS)} ${ctx.rng.pick(JOB_ROLES)}`,
  department: (ctx) => ctx.rng.pick(DEPARTMENTS),

  // commerce
  productName: (ctx) => `${ctx.rng.pick(PRODUCT_ADJ)} ${ctx.rng.pick(PRODUCT_MATERIAL)} ${ctx.rng.pick(PRODUCT_NOUN)}`,
  price: (ctx, a) => ctx.rng.float(num(a[0], 1), num(a[1], 999), 2),
  sku: (ctx) => `${ctx.rng.chars("ABCDEFGHJKLMNPQRSTUVWXYZ", 3)}-${ctx.rng.digits(6)}`,
  currency: (ctx) => data(ctx).currency.code,
  category: (ctx) => ctx.rng.pick(PRODUCT_CATEGORIES),
  color: (ctx) => ctx.rng.pick(COLORS),

  // text
  word: (ctx) => ctx.rng.pick(LOREM_WORDS),
  words: (ctx, a) => makeWords(ctx, num(a[0], 3)),
  sentence: (ctx, a) => makeSentence(ctx, a[0] !== undefined ? num(a[0], 8) : undefined),
  paragraph: (ctx, a) => makeParagraph(ctx, a[0] !== undefined ? num(a[0], 4) : undefined),
  lorem: (ctx, a) => makeParagraph(ctx, num(a[0], 3)),

  // datetime
  past: (ctx, a) => {
    const days = num(a[0], 365);
    return isoOf(Date.now() - ctx.rng.int(1, Math.max(1, days)) * DAY_MS - ctx.rng.int(0, DAY_MS));
  },
  future: (ctx, a) => {
    const days = num(a[0], 365);
    return isoOf(Date.now() + ctx.rng.int(1, Math.max(1, days)) * DAY_MS + ctx.rng.int(0, DAY_MS));
  },
  recent: (ctx, a) => {
    const days = num(a[0], 7);
    return isoOf(Date.now() - ctx.rng.int(0, Math.max(1, days) * DAY_MS));
  },
  soon: (ctx, a) => {
    const days = num(a[0], 7);
    return isoOf(Date.now() + ctx.rng.int(0, Math.max(1, days) * DAY_MS));
  },
  between: (ctx, a) => {
    const from = Date.parse(str(a[0]));
    const to = Date.parse(str(a[1]));
    if (Number.isNaN(from) || Number.isNaN(to)) throw new Error("between(from..to) needs two ISO dates");
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    return isoOf(lo + Math.floor(ctx.rng.next() * (hi - lo)));
  },
  timestamp: (ctx, a) => {
    const days = num(a[0], 365);
    return isoOf(Date.now() - ctx.rng.int(0, Math.max(1, days)) * DAY_MS);
  },
  date: (ctx, a) => String(generators["timestamp"]!(ctx, a)).slice(0, 10),
  time: (ctx) => `${String(ctx.rng.int(0, 23)).padStart(2, "0")}:${String(ctx.rng.int(0, 59)).padStart(2, "0")}`,

  // numbers / booleans / enums
  int: (ctx, a) => ctx.rng.int(num(a[0], 0), num(a[1], 100)),
  number: (ctx, a) => ctx.rng.int(num(a[0], 0), num(a[1], 100)),
  float: (ctx, a) => ctx.rng.float(num(a[0], 0), num(a[1], 1), num(a[2], 2)),
  digit: (ctx) => ctx.rng.int(0, 9),
  bool: (ctx, a) => ctx.rng.bool(a[0] !== undefined ? num(a[0], 0.5) : 0.5),
  boolean: (ctx, a) => ctx.rng.bool(a[0] !== undefined ? num(a[0], 0.5) : 0.5),
  oneOf: (ctx, a) => {
    if (a.length === 0) throw new Error("oneOf(...) needs at least one option");
    return ctx.rng.pick(a);
  },
  enum: (ctx, a) => generators["oneOf"]!(ctx, a),
  weighted: (ctx, a) => {
    // args like "admin:1", "user:5"
    const entries = a.map((raw) => {
      const s = String(raw);
      const idx = s.lastIndexOf(":");
      if (idx < 0) return [s, 1] as [string, number];
      return [s.slice(0, idx), Number(s.slice(idx + 1)) || 0] as [string, number];
    });
    if (entries.length === 0) throw new Error("weighted(...) needs at least one value:weight");
    return ctx.rng.weighted(entries);
  },

  // ids
  autoincrement: (ctx, a) => num(a[0], 1) + ctx.index,
  autoInc: (ctx, a) => generators["autoincrement"]!(ctx, a),
  id: (ctx, a) => generators["autoincrement"]!(ctx, a),
  nanoid: (ctx, a) => ctx.rng.chars("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-", num(a[0], 21)),
  objectId: (ctx) => ctx.rng.hex(24),

  // Nepal-flavoured ids (locale-aware amount/tax numbers)
  pan: (ctx) => ctx.rng.digits(9),
  vat: (ctx) => ctx.rng.digits(9),

  // 0.2.0 additions (uuid/ulid, colours, files, finance, …)
  ...extraGenerators,
};

/** Short human sample values for the `list` command / discovery. */
export const GEN_ORDER: string[] = [
  "firstName", "lastName", "fullName", "gender", "age", "dateOfBirth",
  "email", "username", "url", "domain", "ipv4", "ipv6", "mac", "password", "uuid", "slug",
  "phone", "phoneLocal",
  "street", "city", "state", "country", "countryCode", "zip", "address", "latitude", "longitude", "latlng",
  "company", "catchphrase", "jobTitle", "department",
  "productName", "price", "sku", "currency", "category", "color",
  "word", "words", "sentence", "paragraph", "lorem",
  "past", "future", "recent", "soon", "between", "timestamp", "date", "time",
  "int", "float", "bool", "oneOf", "weighted", "digit",
  "autoincrement", "nanoid", "objectId", "pan", "vat",
  ...EXTRA_GEN_ORDER,
];

/** Look up + invoke a generator by name, throwing a clear error if unknown. */
export function callGen(name: string, ctx: GenContext, args: GenArg[]): unknown {
  const gen = generators[name];
  if (!gen) throw new Error(`Unknown generator: "${name}". Run \`lacspace-fake list\` to see all generators.`);
  return gen(ctx, args);
}

export function hasGen(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(generators, name);
}
