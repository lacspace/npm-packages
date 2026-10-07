/**
 * Work out which Authentication-Results headers were written by the mailbox
 * provider that delivered the message, from the message's own header block.
 *
 * Every mail server prepends its headers, so the provider's own Received hops
 * sit at the top. Walking Received headers top-down, the hops whose "by" host
 * belongs to the provider (or is an internal address) form the provider zone;
 * the first hop run by anyone else marks where the sender's headers begin.
 * Inside that zone an Authentication-Results header is trusted when its
 * authserv-id belongs to the provider. An id-less header (Microsoft 365 writes
 * "Authentication-Results: spf=pass ...") is trusted only when it sits above
 * the provider's inbound Received hop, where a sender cannot place headers.
 *
 * Limit: if a provider adds no Authentication-Results at all, a forged header
 * carrying the provider's own id could still be picked. Pinning the real
 * authserv-id with `trustedAuthservIds` closes that gap once it is known.
 */

import { registrableDomain } from "./domain";

export interface ReceivingServerOptions {
  /** The mailbox's IMAP/POP host (e.g. "imap.hostinger.com"): its domain counts as the provider's. */
  mailboxHost?: string;
}

export interface ReceivingServer {
  /** "by" host names of the provider's own Received hops, top-down. */
  hosts: string[];
  /** Registrable domains treated as the provider's. */
  domains: string[];
  /** authserv-ids of the trusted Authentication-Results headers, top-down, de-duplicated. */
  authservIds: string[];
  /** True when a trusted Authentication-Results header has no authserv-id (Microsoft 365 style). */
  anonymous: boolean;
  /** Only the trusted headers, ready for `parseAuthenticationResults(input)`. */
  input: { authenticationResults: string[]; receivedSpf: string[]; arcAuthenticationResults: string[] };
}

interface Header {
  name: string;
  value: string;
}

function splitHeaders(src: string | string[]): Header[] {
  const text = Array.isArray(src) ? src.filter((s) => typeof s === "string").join("\r\n") : typeof src === "string" ? src : "";
  const end = text.search(/\r?\n\r?\n/);
  const block = (end >= 0 ? text.slice(0, end) : text).replace(/\r?\n[ \t]+/g, " ");
  const out: Header[] = [];
  for (const line of block.split(/\r?\n/)) {
    const m = /^([!-9;-~]+)[ \t]*:[ \t]*(.*)$/.exec(line);
    if (m) out.push({ name: m[1]!.toLowerCase(), value: m[2]!.trim() });
  }
  return out;
}

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** The "by" host of a Received header, or "" for an IP, a bare name or none. */
function byHost(received: string): string {
  const noComments = received.replace(/\([^()]*\)/g, " ");
  const m = /(?:^|\s)by\s+\[?([^\s;\[\]()]+)\]?/i.exec(noComments);
  const h = (m?.[1] ?? "").toLowerCase().replace(/\.$/, "");
  if (!h || IPV4.test(h) || h.includes(":") || !h.includes(".")) return "";
  return h;
}

function authservIdOf(value: string): string | undefined {
  const first = value.trim().split(/[;\s]/)[0] ?? "";
  if (!first || first.includes("=")) return undefined;
  return first.toLowerCase();
}

/**
 * Identify the receiving provider from a full header block (top-down, as in
 * the message) and keep only the Authentication-Results, Received-SPF and
 * ARC-Authentication-Results headers that provider wrote. Never throws.
 */
export function receivingServer(headers: string | string[], opts: ReceivingServerOptions = {}): ReceivingServer {
  const out: ReceivingServer = {
    hosts: [],
    domains: [],
    authservIds: [],
    anonymous: false,
    input: { authenticationResults: [], receivedSpf: [], arcAuthenticationResults: [] },
  };
  try {
    const hs = splitHeaders(headers);
    const domains = new Set<string>();
    if (typeof opts.mailboxHost === "string" && opts.mailboxHost.trim()) {
      const d = registrableDomain(opts.mailboxHost.trim().toLowerCase());
      if (d && !IPV4.test(d)) domains.add(d);
    }

    // Walk the provider's Received hops; `edge` = its inbound hop, `boundary` = first foreign hop.
    let edge = -1;
    let boundary = hs.length;
    let first = true;
    for (let i = 0; i < hs.length; i++) {
      if (hs[i]!.name !== "received") continue;
      const host = byHost(hs[i]!.value);
      if (host) {
        const reg = registrableDomain(host);
        if (first) domains.add(reg); // the topmost named hop is always the provider's
        first = false;
        if (!domains.has(reg)) {
          boundary = i;
          break;
        }
        out.hosts.push(host);
      }
      edge = i;
    }
    if (edge < 0 || !domains.size) return { ...out, domains: [...domains] };
    out.domains = [...domains];

    const ownId = (id: string) => domains.has(registrableDomain(id));
    for (let i = 0; i < boundary; i++) {
      const h = hs[i]!;
      if (h.name === "authentication-results") {
        const id = authservIdOf(h.value);
        if (id ? ownId(id) : i < edge) {
          out.input.authenticationResults.push(h.value);
          if (id) {
            if (!out.authservIds.includes(id)) out.authservIds.push(id);
          } else out.anonymous = true;
        }
      } else if (h.name === "received-spf" && i < edge) {
        out.input.receivedSpf.push(h.value);
      } else if (h.name === "arc-authentication-results") {
        const id = authservIdOf(h.value.replace(/^\s*i\s*=\s*\d+\s*;/i, ""));
        if (id && ownId(id)) out.input.arcAuthenticationResults.push(h.value);
      }
    }
    // Gmail writes Received-SPF just below its inbound hop; keep it when nothing above it.
    if (!out.input.receivedSpf.length) {
      for (let i = edge + 1; i < boundary; i++) {
        const h = hs[i]!;
        if (h.name === "received" || h.name === "authentication-results") break;
        if (h.name === "received-spf") {
          const by = /^\s*\w+\s*\(([^():\s]+)\s*:/.exec(h.value)?.[1];
          if (by && ownId(by)) out.input.receivedSpf.push(h.value);
          break;
        }
      }
    }
  } catch {
    // fall through with what was found
  }
  return out;
}

/** authserv-ids the mailbox provider used in this message, for `trustedAuthservIds`. */
export function inferAuthservIds(headers: string | string[], opts: ReceivingServerOptions = {}): string[] {
  return receivingServer(headers, opts).authservIds;
}
