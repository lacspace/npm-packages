/**
 * SSRF guard: decides whether a host may be contacted by the one-click POST.
 */

function ipv4Octets(s: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  return o.every((n) => n <= 255) ? o : null;
}

/** True for loopback, private, link-local, CGNAT, multicast, reserved and documentation IPv4 ranges. */
export function isPrivateIPv4(ip: string): boolean {
  const o = ipv4Octets(ip);
  if (!o) return false;
  const [a, b, c] = o as [number, number, number, number];
  return (
    a === 0 || // "this network"
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
    (a === 169 && b === 254) || // link-local incl. cloud metadata 169.254.169.254
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // IETF protocol assignments, TEST-NET-1
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3
    a >= 224 // multicast 224/4, reserved 240/4, broadcast
  );
}

/** Parse an IPv6 literal (optionally with an embedded IPv4 tail) into 8 hextets. */
function ipv6Hextets(s: string): number[] | null {
  let str = s.replace(/^\[|\]$/g, "").toLowerCase();
  const zone = str.indexOf("%");
  if (zone >= 0) str = str.slice(0, zone);
  if (!/^[0-9a-f:.]+$/.test(str) || str.indexOf(":") < 0) return null;
  let tail: number[] = [];
  const lastColon = str.lastIndexOf(":");
  const maybeV4 = str.slice(lastColon + 1);
  if (maybeV4.includes(".")) {
    const o = ipv4Octets(maybeV4);
    if (!o) return null;
    tail = [(o[0]! << 8) | o[1]!, (o[2]! << 8) | o[3]!];
    str = str.slice(0, lastColon + 1) + "0:0";
  }
  const halves = str.split("::");
  if (halves.length > 2) return null;
  const parse = (p: string) => (p ? p.split(":") : []);
  const head = parse(halves[0]!);
  const rest = halves.length === 2 ? parse(halves[1]!) : [];
  const fill = 8 - head.length - rest.length;
  if (halves.length === 2 ? fill < 1 : fill !== 0) return null;
  const all = [...head, ...Array(halves.length === 2 ? fill : 0).fill("0"), ...rest];
  if (all.length !== 8 || all.some((h) => !/^[0-9a-f]{1,4}$/.test(h))) return null;
  const out = all.map((h) => parseInt(h, 16));
  if (tail.length) {
    out[6] = tail[0]!;
    out[7] = tail[1]!;
  }
  return out;
}

/** True for ::, ::1, ULA fc00::/7, link-local fe80::/10, multicast, documentation, and v4-mapped/NAT64 private v4. */
export function isPrivateIPv6(ip: string): boolean {
  const h = ipv6Hextets(ip);
  if (!h) return false;
  const [a, b] = h as [number, number];
  const zeros = (n: number) => h.slice(0, n).every((x) => x === 0);
  const v4 = `${h[6]! >> 8}.${h[6]! & 0xff}.${h[7]! >> 8}.${h[7]! & 0xff}`;
  if (zeros(8)) return true; // ::
  if (zeros(7) && h[7] === 1) return true; // ::1
  if (zeros(5) && h[5] === 0xffff) return isPrivateIPv4(v4); // ::ffff:a.b.c.d mapped
  if (zeros(6)) return true; // deprecated IPv4-compatible ::a.b.c.d
  if (a === 0x64 && b === 0xff9b && h.slice(2, 6).every((x) => x === 0)) return isPrivateIPv4(v4); // NAT64
  if ((a & 0xfe00) === 0xfc00) return true; // ULA fc00::/7
  if ((a & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((a & 0xffc0) === 0xfec0) return true; // deprecated site-local
  if ((a & 0xff00) === 0xff00) return true; // multicast
  if (a === 0x2001 && b === 0x0db8) return true; // documentation
  return false;
}

export function isIpLiteral(host: string): boolean {
  return ipv4Octets(host) !== null || ipv6Hextets(host) !== null;
}

/** True for any private / loopback / link-local / CGNAT / ULA IP (v4 or v6). */
export function isPrivateIp(ip: string): boolean {
  return ipv4Octets(ip) ? isPrivateIPv4(ip) : isPrivateIPv6(ip);
}

const PRIVATE_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home.arpa", ".intranet", ".corp"];

/**
 * True when a hostname must not be contacted: private IP literals, localhost,
 * `.local`/`.internal`/`.lan`/`.home.arpa`, and single-label names (no dot),
 * which only resolve on internal search domains.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) return true;
  if (isIpLiteral(host)) return isPrivateIp(host);
  if (host === "localhost") return true;
  if (PRIVATE_SUFFIXES.some((s) => host.endsWith(s))) return true;
  if (!host.includes(".")) return true;
  return false;
}
