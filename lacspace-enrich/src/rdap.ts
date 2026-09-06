/**
 * Domain registration via RDAP — the open, keyless successor to WHOIS. We query
 * the public bootstrap resolver at rdap.org (which redirects to the right
 * registry), and parse registrar, dates, nameservers and status out of the
 * standard RDAP JSON. `parseRdap` is pure and unit-tested; `rdapLookup` never
 * throws — it returns an honest `unavailable` registration on any failure.
 */
import type { DomainRegistration } from "./types.js";

interface RdapEvent { eventAction?: string; eventDate?: string }
interface RdapEntity { roles?: string[]; vcardArray?: unknown; entities?: RdapEntity[] }
interface RdapNameserver { ldhName?: string; unicodeName?: string }
interface RdapResponse {
  events?: RdapEvent[];
  entities?: RdapEntity[];
  nameservers?: RdapNameserver[];
  status?: string[];
  errorCode?: number;
}

/** Read the formatted-name ("fn") out of an RDAP jCard (vcardArray). */
function vcardName(vcardArray: unknown): string | undefined {
  if (!Array.isArray(vcardArray) || vcardArray[1] == null) return undefined;
  const fields = vcardArray[1];
  if (!Array.isArray(fields)) return undefined;
  for (const f of fields) {
    if (Array.isArray(f) && f[0] === "fn" && typeof f[3] === "string") return f[3];
  }
  return undefined;
}

/** Find the registrar entity's name (role "registrar"), searching nested entities. */
function findRegistrar(entities: RdapEntity[] | undefined): string | undefined {
  for (const e of entities ?? []) {
    if (e.roles?.some((r) => r.toLowerCase() === "registrar")) {
      const name = vcardName(e.vcardArray);
      if (name) return name;
    }
    const nested = findRegistrar(e.entities);
    if (nested) return nested;
  }
  return undefined;
}

/** Parse a raw RDAP domain response into our {@link DomainRegistration}. Pure. */
export function parseRdap(json: unknown): DomainRegistration {
  const r = (json ?? {}) as RdapResponse;
  if (r.errorCode) return { source: "unavailable", note: `RDAP error ${r.errorCode}` };

  const reg: DomainRegistration = { source: "rdap" };
  const registrar = findRegistrar(r.entities);
  if (registrar) reg.registrar = registrar;

  for (const ev of r.events ?? []) {
    const action = (ev.eventAction ?? "").toLowerCase();
    if (!ev.eventDate) continue;
    if (action === "registration") reg.createdAt = ev.eventDate;
    else if (action === "expiration") reg.expiresAt = ev.eventDate;
    // Prefer the registry's "last changed"; only fall back to the RDAP-DB timestamp.
    else if (action === "last changed") reg.updatedAt = ev.eventDate;
    else if (action === "last update of rdap database" && !reg.updatedAt) reg.updatedAt = ev.eventDate;
  }

  const ns = (r.nameservers ?? [])
    .map((n) => (n.ldhName ?? n.unicodeName ?? "").toLowerCase())
    .filter(Boolean);
  if (ns.length) reg.nameServers = ns;

  if (Array.isArray(r.status) && r.status.length) reg.status = r.status;

  const hasAny = reg.registrar || reg.createdAt || reg.expiresAt || reg.nameServers || reg.status;
  if (!hasAny) return { source: "unavailable", note: "RDAP returned no usable fields." };
  return reg;
}

/** Fetch a domain's registration via RDAP. Never throws. */
export async function rdapLookup(domain: string, opts: { timeoutMs?: number } = {}): Promise<DomainRegistration> {
  const ms = opts.timeoutMs ?? 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      signal: controller.signal,
      redirect: "follow",
      headers: { accept: "application/rdap+json, application/json" },
    });
    if (!res.ok) return { source: "unavailable", note: `RDAP HTTP ${res.status}` };
    const json = (await res.json()) as unknown;
    return parseRdap(json);
  } catch (err) {
    return { source: "unavailable", note: `RDAP unavailable: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    clearTimeout(timer);
  }
}
