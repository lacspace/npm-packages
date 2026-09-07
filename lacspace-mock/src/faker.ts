/**
 * A tiny, dependency-free, deterministic fake-data generator. Everything is
 * driven by a seeded PRNG (mulberry32 over an FNV-1a hash of the seed string),
 * so the same seed always produces the same values — which is what makes a
 * mock server's generated data stable across restarts.
 */

/** FNV-1a hash of a string into a 32-bit unsigned integer. */
export function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 PRNG — returns a function yielding floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Ava", "Liam", "Noah", "Emma", "Olivia", "Ethan", "Mia", "Aria", "Kabir",
  "Sita", "Ram", "Nina", "Leo", "Zoe", "Kai", "Maya", "Ian", "Lena", "Omar",
  "Priya", "Arjun", "Sara", "Diego", "Yuki", "Chen", "Amara", "Nur", "Ravi",
];
const LAST = [
  "Sharma", "Smith", "Kim", "Patel", "Garcia", "Khan", "Ali", "Chen", "Nguyen",
  "Silva", "Okafor", "Rossi", "Haile", "Mensah", "Novak", "Costa", "Adhikari",
  "Rana", "Thapa", "Gurung", "Lopez", "Weber", "Yamada", "Ivanov", "Dubois",
];
const WORDS = [
  "alpha", "bravo", "delta", "nova", "quartz", "ember", "lumen", "vertex",
  "cobalt", "sable", "orbit", "ridge", "flux", "prism", "cedar", "onyx",
  "harbor", "tundra", "meadow", "cinder", "willow", "basalt", "zephyr",
];
const DOMAINS = ["example.com", "mail.dev", "test.io", "demo.app", "sandbox.co"];
const CITIES = [
  "Kathmandu", "Lisbon", "Austin", "Nairobi", "Osaka", "Porto", "Denver",
  "Hanoi", "Accra", "Riga", "Cusco", "Bergen", "Pune", "Cairo", "Quito",
];
const COMPANIES = [
  "Lacspace", "Nova Labs", "Ember Co", "Vertex Systems", "Cobalt Works",
  "Prism AI", "Harbor Data", "Orbit Cloud", "Cedar & Co", "Onyx Studio",
];

/** A seeded fake-data generator instance. Each call advances the PRNG. */
export interface Faker {
  /** The underlying PRNG (float in [0,1)). Advances on every generator call. */
  rng: () => number;
  int: (min?: number, max?: number) => number;
  float: (min?: number, max?: number, decimals?: number) => number;
  bool: () => boolean;
  pick: <T>(arr: readonly T[]) => T;
  firstName: () => string;
  lastName: () => string;
  name: () => string;
  word: () => string;
  words: (n?: number) => string;
  sentence: () => string;
  email: () => string;
  username: () => string;
  uuid: () => string;
  city: () => string;
  company: () => string;
  phone: () => string;
  date: (year?: number) => string;
}

/** Build a {@link Faker} seeded from a string (deterministic per seed). */
export function createFaker(seed: string | number): Faker {
  const rng = mulberry32(typeof seed === "number" ? seed >>> 0 : hashSeed(seed));

  const int = (min = 0, max = 100): number => {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    if (hi < lo) return lo;
    return Math.floor(rng() * (hi - lo + 1)) + lo;
  };
  const float = (min = 0, max = 1, decimals = 2): number => {
    const v = rng() * (max - min) + min;
    const p = Math.pow(10, decimals);
    return Math.round(v * p) / p;
  };
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)] as T;
  const firstName = (): string => pick(FIRST);
  const lastName = (): string => pick(LAST);
  const name = (): string => `${firstName()} ${lastName()}`;
  const word = (): string => pick(WORDS);
  const words = (n = 3): string => Array.from({ length: Math.max(1, n) }, () => word()).join(" ");
  const sentence = (): string => {
    const s = words(int(4, 9));
    return s.charAt(0).toUpperCase() + s.slice(1) + ".";
  };
  const username = (): string => `${firstName().toLowerCase()}.${lastName().toLowerCase()}${int(1, 99)}`;
  const email = (): string => `${username()}@${pick(DOMAINS)}`;
  const uuid = (): string => {
    let out = "";
    const chars = "0123456789abcdef";
    const tpl = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
    for (const ch of tpl) {
      if (ch === "x") out += chars[Math.floor(rng() * 16)];
      else if (ch === "y") out += chars[8 + Math.floor(rng() * 4)];
      else out += ch;
    }
    return out;
  };
  const city = (): string => pick(CITIES);
  const company = (): string => pick(COMPANIES);
  const phone = (): string => {
    let d = "";
    for (let i = 0; i < 10; i++) d += String(int(0, 9));
    return `+1${d}`;
  };
  const date = (year?: number): string => {
    const y = year ?? int(2020, 2026);
    const mo = int(1, 12);
    const day = int(1, 28);
    const pad = (n: number): string => String(n).padStart(2, "0");
    return `${y}-${pad(mo)}-${pad(day)}`;
  };

  return {
    rng, int, float, bool: () => rng() < 0.5, pick,
    firstName, lastName, name, word, words, sentence,
    email, username, uuid, city, company, phone, date,
  };
}

/**
 * Resolve a `fake.<kind> [args...]` expression against a faker. Returns the
 * generated value as a string (numbers/booleans stringified). Unknown kinds
 * yield an empty string. Used by the template layer for `{{fake.email}}` etc.
 */
export function resolveFake(faker: Faker, kind: string, args: string[]): string {
  const n = (i: number, d: number): number => {
    const v = Number(args[i]);
    return Number.isFinite(v) ? v : d;
  };
  switch (kind) {
    case "int": return String(faker.int(n(0, 0), n(1, 100)));
    case "float": return String(faker.float(n(0, 0), n(1, 1), n(2, 2)));
    case "bool": return String(faker.bool());
    case "name": return faker.name();
    case "firstName": return faker.firstName();
    case "lastName": return faker.lastName();
    case "word": return faker.word();
    case "words": return faker.words(n(0, 3));
    case "sentence": return faker.sentence();
    case "email": return faker.email();
    case "username": return faker.username();
    case "uuid": return faker.uuid();
    case "city": return faker.city();
    case "company": return faker.company();
    case "phone": return faker.phone();
    case "date": return faker.date(args[0] ? n(0, 2025) : undefined);
    default: return "";
  }
}
