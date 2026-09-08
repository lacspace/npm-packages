import type { Rng } from "./types";
import { hashSeed, hashString, makeRng, mulberry32 } from "./rng";
import { getBaseSeed, registerResetter } from "./state";

/**
 * Options for {@link Faker.email}.
 */
export interface EmailOptions {
  /** Force the local part instead of deriving it from a random name. */
  local?: string;
  /** Force the domain (defaults to a random provider like `example.com`). */
  domain?: string;
}

/**
 * A tiny, seeded, zero-dependency generator of realistic-looking test data —
 * names, emails, addresses, dates, ids and more. Every value is drawn from the
 * bound {@link Rng} stream, so identical seeds reproduce identical data. There
 * is no `faker` dependency; the word lists are intentionally small.
 */
export interface Faker {
  /** The underlying deterministic RNG (shared with the helpers below). */
  readonly rng: Rng;

  // people
  /** A first name, e.g. `"Ada"`. */
  firstName(): string;
  /** A last name, e.g. `"Lovelace"`. */
  lastName(): string;
  /** `"First Last"`. */
  fullName(): string;
  /** Alias of {@link Faker.fullName}. */
  name(): string;
  /** A lowercase handle like `"ada.lovelace42"`. */
  username(): string;
  /** An email address; override the local part and/or domain via `opts`. */
  email(opts?: EmailOptions): string;
  /** An E.164-shaped phone number, e.g. `"+14155550142"`. */
  phone(): string;
  /** A job title, e.g. `"Lead Engineer"`. */
  jobTitle(): string;

  // words / text
  /** A single lowercase word. */
  word(): string;
  /** `n` space-joined words (default `3`). */
  words(n?: number): string;
  /** A capitalised sentence of `n` words (default `6–12`). */
  sentence(n?: number): string;
  /** `n` sentences joined into a paragraph (default `3–5`). */
  paragraph(n?: number): string;
  /** A url-safe slug, e.g. `"quick-amber-fox"`. */
  slug(words?: number): string;

  // places
  /** A city name. */
  city(): string;
  /** A country name. */
  country(): string;
  /** A street address, e.g. `"742 Maple Ave"`. */
  streetAddress(): string;
  /** A 5-digit postal code. */
  zipCode(): string;

  // company / web
  /** A company name, e.g. `"Blue Harbor Labs"`. */
  company(): string;
  /** A bare domain, e.g. `"blueharbor.com"`. */
  domain(): string;
  /** A `https://` url on a random domain, e.g. `"https://blueharbor.com/amber"`. */
  url(): string;
  /** An IPv4 address, e.g. `"12.34.56.78"`. */
  ipv4(): string;
  /** A MAC address, e.g. `"a1:b2:c3:d4:e5:f6"`. */
  mac(): string;
  /** A `#rrggbb` hex colour. */
  hexColor(): string;

  // scalars / ids
  /** An integer in `[min, max]` (delegates to the RNG). */
  int(min: number, max: number): number;
  /** A float in `[min, max)` (delegates to the RNG). */
  float(min: number, max: number): number;
  /** `true` with probability `p` (delegates to the RNG). */
  boolean(p?: number): boolean;
  /** A deterministic v4-shaped UUID (delegates to the RNG). */
  uuid(): string;
  /** A short alphanumeric id of `len` chars (default `8`). */
  id(len?: number): string;
  /** A uniformly random element of `arr`. */
  arrayElement<T>(arr: readonly T[]): T;

  // dates
  /** A `Date` at most `days` before now (default `365`). */
  pastDate(days?: number): Date;
  /** A `Date` at most `days` after now (default `365`). */
  futureDate(days?: number): Date;
  /** A `Date` within the last `days` (default `7`). */
  recentDate(days?: number): Date;
  /** A `Date` uniformly between `start` and `end` (inclusive of `start`). */
  dateBetween(start: Date | number, end: Date | number): Date;
}

const FIRST_NAMES = [
  "Ada", "Grace", "Linus", "Alan", "Katherine", "Edsger", "Barbara", "Dennis",
  "Margaret", "Ken", "Radia", "Guido", "Anita", "Tim", "Shafi", "Leslie",
  "Hedy", "Claude", "Ruth", "Donald", "Frances", "John", "Sofia", "Amir",
];
const LAST_NAMES = [
  "Lovelace", "Hopper", "Torvalds", "Turing", "Johnson", "Dijkstra", "Liskov",
  "Ritchie", "Hamilton", "Thompson", "Perlman", "Rossum", "Borg", "Berners-Lee",
  "Goldwasser", "Lamport", "Lamarr", "Shannon", "Teitelbaum", "Knuth", "Allen",
];
const WORDS = [
  "amber", "harbor", "quick", "silent", "fox", "river", "maple", "cobalt",
  "lunar", "ember", "willow", "quartz", "delta", "orbit", "cedar", "pixel",
  "nimbus", "sierra", "vector", "onyx", "atlas", "zephyr", "flint", "aurora",
  "meadow", "canyon", "beacon", "cinder", "drift", "echo", "fable", "glint",
];
const CITIES = [
  "Kathmandu", "Lisbon", "Nairobi", "Osaka", "Bogota", "Reykjavik", "Hanoi",
  "Tallinn", "Accra", "Medellin", "Porto", "Bergen", "Kyoto", "Cusco", "Ghent",
];
const COUNTRIES = [
  "Nepal", "Portugal", "Kenya", "Japan", "Colombia", "Iceland", "Vietnam",
  "Estonia", "Ghana", "Norway", "Peru", "Belgium", "Chile", "Morocco",
];
const STREETS = ["Maple", "Oak", "Cedar", "Birch", "Elm", "Pine", "Willow", "Ash", "Aspen"];
const STREET_SUFFIX = ["Ave", "St", "Rd", "Blvd", "Ln", "Way", "Ct"];
const COMPANY_ADJ = ["Blue", "Bright", "North", "Silver", "Rapid", "Clever", "Solid", "Prime"];
const COMPANY_NOUN = ["Harbor", "Peak", "Loop", "Forge", "Grove", "Nova", "Anchor", "Summit"];
const COMPANY_SUFFIX = ["Labs", "Systems", "Works", "Group", "Studio", "Collective", "Co"];
const JOB_PREFIX = ["Lead", "Senior", "Staff", "Principal", "Junior", "Head of"];
const JOB_ROLE = ["Engineer", "Designer", "Analyst", "Architect", "Scientist", "Manager"];
const EMAIL_DOMAINS = ["example.com", "example.org", "test.dev", "mail.example.com"];
const TLDS = ["com", "org", "dev", "io", "net"];

function capitalise(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

/**
 * Wrap a seeded {@link Rng} into the higher-level {@link Faker} data helpers.
 * Every method is a pure function of the RNG stream, so the whole surface is
 * reproducible for a given seed. Pass any RNG (e.g. `ctx.seed` inside a build,
 * or `makeRng(mulberry32(1))`).
 */
export function makeFaker(rng: Rng): Faker {
  const firstName = () => rng.pick(FIRST_NAMES);
  const lastName = () => rng.pick(LAST_NAMES);
  const fullName = () => `${firstName()} ${lastName()}`;

  function words(n = 3): string {
    const out: string[] = [];
    for (let i = 0; i < Math.max(0, n); i++) out.push(rng.pick(WORDS));
    return out.join(" ");
  }

  function sentence(n?: number): string {
    const count = n ?? rng.int(6, 12);
    return capitalise(words(count)) + ".";
  }

  function domain(): string {
    return `${rng.pick(COMPANY_ADJ).toLowerCase()}${rng.pick(COMPANY_NOUN).toLowerCase()}.${rng.pick(TLDS)}`;
  }

  const faker: Faker = {
    rng,
    firstName,
    lastName,
    fullName,
    name: fullName,
    username() {
      return `${firstName()}.${lastName()}${rng.int(1, 99)}`
        .toLowerCase()
        .replace(/[^a-z0-9.]/g, "");
    },
    email(opts) {
      const local =
        opts?.local ??
        `${firstName()}.${lastName()}${rng.int(1, 999)}`
          .toLowerCase()
          .replace(/[^a-z0-9.]/g, "");
      const dom = opts?.domain ?? rng.pick(EMAIL_DOMAINS);
      return `${local}@${dom}`;
    },
    phone() {
      let n = "";
      for (let i = 0; i < 10; i++) n += rng.int(0, 9);
      return "+1" + n;
    },
    jobTitle() {
      return `${rng.pick(JOB_PREFIX)} ${rng.pick(JOB_ROLE)}`;
    },
    word() {
      return rng.pick(WORDS);
    },
    words,
    sentence,
    paragraph(n?: number) {
      const count = n ?? rng.int(3, 5);
      const out: string[] = [];
      for (let i = 0; i < Math.max(1, count); i++) out.push(sentence());
      return out.join(" ");
    },
    slug(wordCount = 3) {
      const out: string[] = [];
      for (let i = 0; i < Math.max(1, wordCount); i++) out.push(rng.pick(WORDS));
      return out.join("-");
    },
    city() {
      return rng.pick(CITIES);
    },
    country() {
      return rng.pick(COUNTRIES);
    },
    streetAddress() {
      return `${rng.int(1, 9999)} ${rng.pick(STREETS)} ${rng.pick(STREET_SUFFIX)}`;
    },
    zipCode() {
      let s = "";
      for (let i = 0; i < 5; i++) s += rng.int(0, 9);
      return s;
    },
    company() {
      return `${rng.pick(COMPANY_ADJ)} ${rng.pick(COMPANY_NOUN)} ${rng.pick(COMPANY_SUFFIX)}`;
    },
    domain,
    url() {
      return `https://${domain()}/${rng.pick(WORDS)}`;
    },
    ipv4() {
      return [rng.int(1, 254), rng.int(0, 255), rng.int(0, 255), rng.int(1, 254)].join(".");
    },
    mac() {
      const parts: string[] = [];
      for (let i = 0; i < 6; i++) parts.push(rng.int(0, 255).toString(16).padStart(2, "0"));
      return parts.join(":");
    },
    hexColor() {
      let s = "#";
      for (let i = 0; i < 6; i++) s += "0123456789abcdef"[rng.int(0, 15)];
      return s;
    },
    int(min, max) {
      return rng.int(min, max);
    },
    float(min, max) {
      return rng.float(min, max);
    },
    boolean(p) {
      return rng.bool(p);
    },
    uuid() {
      return rng.uuid();
    },
    id(len = 8) {
      const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
      let s = "";
      for (let i = 0; i < Math.max(1, len); i++) s += alphabet[rng.int(0, alphabet.length - 1)];
      return s;
    },
    arrayElement(arr) {
      return rng.pick(arr);
    },
    pastDate(days = 365) {
      const now = Date.now();
      return new Date(now - rng.int(0, days) * 86400000 - rng.int(0, 86399999));
    },
    futureDate(days = 365) {
      const now = Date.now();
      return new Date(now + rng.int(0, days) * 86400000 + rng.int(0, 86399999));
    },
    recentDate(days = 7) {
      const now = Date.now();
      return new Date(now - rng.int(0, Math.max(0, days) * 86400000));
    },
    dateBetween(start, end) {
      const a = start instanceof Date ? start.getTime() : start;
      const b = end instanceof Date ? end.getTime() : end;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      return new Date(lo + Math.floor(rng.next() * (hi - lo + 1)));
    },
  };
  return faker;
}

/**
 * A process-wide {@link Faker} bound to a stream derived from the current base
 * seed. It restarts on `resetSequences()` (call it after `seed(n)`), so a suite
 * that resets between cases gets reproducible standalone fake data. Inside a
 * factory `build(ctx)`, prefer `ctx.fake` — it is per-build reproducible.
 */
export const fake: Faker = makeFaker(makeGlobalFakeRng());

function makeGlobalFakeRng(): Rng {
  const salt = hashString("lacspace.fixtures.fake");
  let stream = mulberry32(hashSeed(getBaseSeed(), salt));
  registerResetter(() => {
    stream = mulberry32(hashSeed(getBaseSeed(), salt));
  });
  return makeRng(() => stream());
}
