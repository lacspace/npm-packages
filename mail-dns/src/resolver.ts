/**
 * DNS access: the default `node:dns/promises` resolver (loaded lazily, so the
 * pure parsers stay isomorphic), a DNS-over-HTTPS JSON resolver for edge
 * runtimes, and `Dns`, a cached, timeout-guarded wrapper that turns resolver
 * errors into "no record" vs "lookup failed".
 */
import type { DnsResolver, FetchLike } from "./types.js";

/** Error codes that mean "the name/record does not exist" rather than "DNS broke". */
const NO_DATA = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN", "ENONAME", "NOTFOUND", "ENOENT"]);

function dnsError(code: string, name: string): Error {
  return Object.assign(new Error(`${code} ${name}`), { code, hostname: name });
}

/** The default resolver: Node's `dns/promises`, imported on first use. */
export function nodeResolver(): DnsResolver {
  let mod: Promise<typeof import("node:dns/promises")> | undefined;
  const get = () => (mod ??= import("node:dns/promises"));
  return {
    resolveTxt: async (n) => (await get()).resolveTxt(n),
    resolveMx: async (n) => (await get()).resolveMx(n),
    resolve4: async (n) => (await get()).resolve4(n),
    resolve6: async (n) => (await get()).resolve6(n),
    resolveCname: async (n) => (await get()).resolveCname(n),
  };
}

const TYPE_NUM: Record<string, number> = { A: 1, CNAME: 5, MX: 15, TXT: 16, AAAA: 28 };

/**
 * Split DoH TXT `data` into its character-strings. Cloudflare returns
 * `"\"part one\" \"part two\""`; Google returns the strings already joined and
 * unquoted. Handles `\"`, `\\` and `\DDD` escapes. Pure.
 */
export function parseTxtData(data: string): string[] {
  const s = data.trim();
  if (!s.startsWith('"')) return [s];
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && s[i] !== '"') i++;
    if (i >= s.length) break;
    i++;
    let cur = "";
    while (i < s.length && s[i] !== '"') {
      if (s[i] === "\\" && i + 1 < s.length) {
        const d = s.slice(i + 1, i + 4);
        if (/^\d{3}$/.test(d)) { cur += String.fromCharCode(Number(d)); i += 4; continue; }
        cur += s[i + 1]; i += 2; continue;
      }
      cur += s[i]; i++;
    }
    out.push(cur);
    i++;
  }
  return out.length ? out : [""];
}

interface DohJson {
  Status?: number;
  Answer?: { name?: string; type?: number; data?: string }[];
}

/**
 * Turn a DoH JSON response (Cloudflare / Google format) into the same shape
 * `node:dns/promises` returns for `type`. Throws `ENOTFOUND` for NXDOMAIN,
 * `ENODATA` when there is no answer of that type, `ESERVFAIL` otherwise. Pure.
 */
export function parseDohAnswer(json: unknown, type: "TXT"): string[][];
export function parseDohAnswer(json: unknown, type: "MX"): { exchange: string; priority: number }[];
export function parseDohAnswer(json: unknown, type: "A" | "AAAA" | "CNAME"): string[];
export function parseDohAnswer(json: unknown, type: "TXT" | "MX" | "A" | "AAAA" | "CNAME"): unknown {
  const j = (json ?? {}) as DohJson;
  const name = "doh";
  if (j.Status === 3) throw dnsError("ENOTFOUND", name);
  if (j.Status !== undefined && j.Status !== 0) throw dnsError(j.Status === 2 ? "ESERVFAIL" : "EREFUSED", name);
  const want = TYPE_NUM[type];
  const ans = (j.Answer ?? []).filter((a) => a.type === want && typeof a.data === "string");
  if (!ans.length) throw dnsError("ENODATA", name);
  const strip = (h: string) => h.replace(/\.$/, "");
  switch (type) {
    case "TXT":
      return ans.map((a) => parseTxtData(a.data!));
    case "MX":
      return ans.map((a) => {
        const [p, h = ""] = a.data!.trim().split(/\s+/);
        return { priority: Number(p), exchange: strip(h) };
      });
    default:
      return ans.map((a) => strip(a.data!.trim()));
  }
}

/** A resolver that speaks the DoH JSON API (`https://cloudflare-dns.com/dns-query`, `https://dns.google/resolve`). */
export function dohResolver(endpoint: string, opts: { fetch?: FetchLike } = {}): DnsResolver {
  const f = opts.fetch ?? (globalThis as { fetch?: FetchLike }).fetch;
  async function q(name: string, type: string): Promise<unknown> {
    if (!f) throw dnsError("ENOFETCH", name);
    const sep = endpoint.includes("?") ? "&" : "?";
    const url = `${endpoint}${sep}name=${encodeURIComponent(name)}&type=${type}`;
    const res = await f(url, { headers: { accept: "application/dns-json" } });
    if (!res.ok) throw dnsError("ESERVFAIL", name);
    const body = res.json ? await res.json() : JSON.parse(await res.text());
    return body;
  }
  return {
    resolveTxt: async (n) => parseDohAnswer(await q(n, "TXT"), "TXT"),
    resolveMx: async (n) => parseDohAnswer(await q(n, "MX"), "MX"),
    resolve4: async (n) => parseDohAnswer(await q(n, "A"), "A"),
    resolve6: async (n) => parseDohAnswer(await q(n, "AAAA"), "AAAA"),
    resolveCname: async (n) => parseDohAnswer(await q(n, "CNAME"), "CNAME"),
  };
}

/** Pick the resolver: explicit `resolver` > `doh` > Node's built-in. */
export function pickResolver(o: { resolver?: DnsResolver; doh?: string; fetch?: FetchLike }): DnsResolver {
  if (o.resolver) return o.resolver;
  if (o.doh) return dohResolver(o.doh, { fetch: o.fetch });
  return nodeResolver();
}

/** A lookup outcome: found, nothing there, failed, or the resolver can't do this type. */
export type Lookup<T> =
  | { kind: "ok"; value: T }
  | { kind: "none" }
  | { kind: "error"; error: string }
  | { kind: "unsupported" };

/** Cached, timeout-guarded DNS access used by every check. Never throws. */
export class Dns {
  private cache = new Map<string, Promise<Lookup<unknown>>>();
  queries = 0;
  constructor(readonly resolver: DnsResolver, readonly timeoutMs = 5000) {}

  private run<T>(key: string, fn: (() => Promise<T>) | undefined): Promise<Lookup<T>> {
    if (!fn) return Promise.resolve({ kind: "unsupported" });
    const hit = this.cache.get(key);
    if (hit) return hit as Promise<Lookup<T>>;
    this.queries++;
    const p = new Promise<Lookup<T>>((resolve) => {
      const t = setTimeout(() => resolve({ kind: "error", error: "ETIMEOUT" }), this.timeoutMs);
      Promise.resolve()
        .then(fn)
        .then(
          (v) => {
            clearTimeout(t);
            resolve(Array.isArray(v) && v.length === 0 ? { kind: "none" } : { kind: "ok", value: v });
          },
          (e: { code?: string; message?: string }) => {
            clearTimeout(t);
            const code = String(e?.code ?? e?.message ?? "EUNKNOWN");
            resolve(NO_DATA.has(code) ? { kind: "none" } : { kind: "error", error: code });
          },
        );
    });
    this.cache.set(key, p as Promise<Lookup<unknown>>);
    return p;
  }

  /** TXT records with their character-strings joined (as DNS consumers do). */
  async txt(name: string): Promise<Lookup<string[]>> {
    const r = await this.run(`TXT ${name}`, () => this.resolver.resolveTxt(name));
    return r.kind === "ok" ? { kind: "ok", value: r.value.map((c) => (Array.isArray(c) ? c.join("") : String(c))) } : r;
  }
  async mx(name: string): Promise<Lookup<{ exchange: string; priority: number }[]>> {
    const r = await this.run(`MX ${name}`, () => this.resolver.resolveMx(name));
    return r.kind === "ok"
      ? { kind: "ok", value: r.value.map((m) => ({ priority: m.priority, exchange: String(m.exchange).toLowerCase().replace(/\.$/, "") })) }
      : r;
  }
  a(name: string): Promise<Lookup<string[]>> {
    const f = this.resolver.resolve4?.bind(this.resolver);
    return this.run(`A ${name}`, f && (() => f(name)));
  }
  aaaa(name: string): Promise<Lookup<string[]>> {
    const f = this.resolver.resolve6?.bind(this.resolver);
    return this.run(`AAAA ${name}`, f && (() => f(name)));
  }
  cname(name: string): Promise<Lookup<string[]>> {
    const f = this.resolver.resolveCname?.bind(this.resolver);
    return this.run(`CNAME ${name}`, f && (() => f(name)));
  }
}

/** Lower-case, trim, drop a trailing dot and a leading `@`/`*.`-free form. Pure. */
export function normalizeDomain(d: string): string {
  return d.trim().toLowerCase().replace(/^@/, "").replace(/\.$/, "");
}
