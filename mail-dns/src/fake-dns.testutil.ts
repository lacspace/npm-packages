import type { DnsResolver, FetchLike } from "./types.js";

export type Zone = Record<string, unknown>;

const err = (code: string, name: string) => Object.assign(new Error(`${code} ${name}`), { code });

/** In-memory resolver keyed by "TYPE name" (e.g. "TXT example.com"). Missing → ENOTFOUND. */
export function fakeResolver(zone: Zone, opts: { fail?: string[]; noAddr?: boolean } = {}): DnsResolver & { calls: string[] } {
  const calls: string[] = [];
  const get = (type: string, name: string) => {
    const key = `${type} ${name.toLowerCase()}`;
    calls.push(key);
    if (opts.fail?.includes(key)) return Promise.reject(err("ESERVFAIL", name));
    if (!(key in zone)) return Promise.reject(err("ENOTFOUND", name));
    return Promise.resolve(zone[key]);
  };
  const r: DnsResolver & { calls: string[] } = {
    calls,
    resolveTxt: async (n) => ((await get("TXT", n)) as (string | string[])[]).map((t) => (Array.isArray(t) ? t : [t])),
    resolveMx: async (n) => (await get("MX", n)) as { exchange: string; priority: number }[],
    resolveCname: async (n) => (await get("CNAME", n)) as string[],
  };
  if (!opts.noAddr) {
    r.resolve4 = async (n) => (await get("A", n)) as string[];
    r.resolve6 = async (n) => (await get("AAAA", n)) as string[];
  }
  return r;
}

/** Fake fetch serving a map of url → body (text/plain), else 404. */
export function fakeFetch(files: Record<string, string | { status: number; body?: string; contentType?: string }>): FetchLike {
  return async (url) => {
    const f = files[url];
    const v = typeof f === "string" ? { status: 200, body: f, contentType: "text/plain" } : f ?? { status: 404, body: "" };
    return {
      ok: v.status >= 200 && v.status < 300,
      status: v.status,
      headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? v.contentType ?? "text/plain" : null) },
      text: async () => v.body ?? "",
      json: async () => JSON.parse(v.body ?? "null"),
    };
  };
}
