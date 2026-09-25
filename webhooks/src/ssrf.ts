/**
 * Outbound-URL guard for webhook delivery (server-side request forgery).
 *
 * A service that POSTs to customer-registered URLs can be aimed at its own
 * network: `http://169.254.169.254/` returns cloud credentials on AWS, GCP and
 * Azure. Cloud metadata endpoints are always refused. With
 * `blockPrivateNetworks`, loopback, private, link-local, CGNAT and unique-local
 * addresses are refused too, and — given a resolver — so are hostnames that
 * resolve to them.
 */

const METADATA_HOSTS = new Set(["metadata.google.internal", "metadata", "metadata.azure.com", "instance-data", "instance-data.ec2.internal"]);

function ipv4(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n <= 255) ? parts : null;
}

/** Cloud metadata: 169.254.169.254, fd00:ec2::254, 100.100.100.200 (Alibaba), and their host names. */
export function isMetadataAddress(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (METADATA_HOSTS.has(h)) return true;
  const v4 = ipv4(h) ?? mappedV4(h);
  if (v4) return (v4[0] === 169 && v4[1] === 254) || v4.join(".") === "100.100.100.200";
  return h === "fd00:ec2::254";
}

function mappedV4(h: string): number[] | null {
  // ::ffff:a.b.c.d or ::ffff:hhhh:hhhh (WHATWG URL normalises to the hex form)
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(h);
  if (dotted) return ipv4(dotted[1]!);
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(h);
  if (!hex) return null;
  const a = parseInt(hex[1]!, 16);
  const b = parseInt(hex[2]!, 16);
  return [a >> 8, a & 255, b >> 8, b & 255];
}

/** Loopback, private, link-local, CGNAT, unspecified, unique-local or multicast. */
export function isPrivateAddress(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (isMetadataAddress(h)) return true;
  const v4 = ipv4(h) ?? mappedV4(h);
  if (v4) {
    const [a, b] = v4 as [number, number];
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (!h.includes(":")) return false;
  return h === "::" || h === "::1" || /^f[cd][0-9a-f]{0,2}:/.test(h) || /^fe[89ab][0-9a-f]?:/.test(h) || /^ff[0-9a-f]{0,2}:/.test(h);
}

export interface UrlGuardOptions {
  /** Also refuse private, loopback and link-local destinations. Default false. */
  blockPrivateNetworks?: boolean;
  /** Resolve a hostname to its IP addresses so names that point inside are refused too. */
  resolveHost?: (hostname: string) => Promise<string[]>;
}

/** Throws with a reason when the URL may not be delivered to. */
export async function assertDeliverableUrl(url: string, opts: UrlGuardOptions = {}): Promise<void> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`invalid webhook URL: ${url}`);
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`webhook URL must be http(s): ${u.protocol}`);
  const host = u.hostname;
  if (isMetadataAddress(host)) throw new Error(`blocked: ${host} is a cloud metadata address`);
  if (!opts.blockPrivateNetworks) return;
  if (isPrivateAddress(host)) throw new Error(`blocked: ${host} is a private-network address`);
  if (opts.resolveHost && !ipv4(host) && !host.startsWith("[")) {
    for (const ip of await opts.resolveHost(host)) {
      if (isPrivateAddress(ip)) throw new Error(`blocked: ${host} resolves to private address ${ip}`);
    }
  }
}
