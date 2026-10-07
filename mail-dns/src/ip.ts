/** IPv4 / IPv6 parsing and CIDR matching. Pure, no deps. */

/** Parse dotted-quad IPv4 to an unsigned 32-bit number, or `undefined`. */
export function parseIp4(s: string): number | undefined {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s.trim());
  if (!m) return undefined;
  let n = 0;
  for (let i = 1; i <= 4; i++) {
    const o = Number(m[i]);
    if (o > 255 || (m[i]!.length > 1 && m[i]!.startsWith("0"))) return undefined;
    n = n * 256 + o;
  }
  return n;
}

/** Parse an IPv6 address (with `::` and embedded IPv4) to a 128-bit bigint, or `undefined`. */
export function parseIp6(s: string): bigint | undefined {
  let str = s.trim().toLowerCase();
  if (!str.includes(":")) return undefined;
  const zone = str.indexOf("%");
  if (zone >= 0) str = str.slice(0, zone);
  // embedded IPv4 tail
  const lastColon = str.lastIndexOf(":");
  const tail = str.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIp4(tail);
    if (v4 === undefined) return undefined;
    str = `${str.slice(0, lastColon + 1)}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const dbl = str.split("::");
  if (dbl.length > 2) return undefined;
  const head = dbl[0] ? dbl[0].split(":") : [];
  const rest = dbl.length === 2 && dbl[1] ? dbl[1].split(":") : [];
  let groups: string[];
  if (dbl.length === 2) {
    const fill = 8 - head.length - rest.length;
    if (fill < 1) return undefined;
    groups = [...head, ...Array<string>(fill).fill("0"), ...rest];
  } else groups = head;
  if (groups.length !== 8) return undefined;
  let n = 0n;
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return undefined;
    n = (n << 16n) | BigInt(parseInt(g, 16));
  }
  return n;
}

export function ipFamily(ip: string): 4 | 6 | undefined {
  if (parseIp4(ip) !== undefined) return 4;
  if (parseIp6(ip) !== undefined) return 6;
  return undefined;
}

/** Does `ip` fall inside `net/prefix`? Families must match. */
export function cidrMatch(ip: string, net: string, prefix?: number): boolean {
  const a4 = parseIp4(ip);
  const n4 = parseIp4(net);
  if (a4 !== undefined && n4 !== undefined) {
    const p = prefix ?? 32;
    if (p < 0 || p > 32) return false;
    if (p === 0) return true;
    const mask = p === 32 ? 0xffffffff : (~0 << (32 - p)) >>> 0;
    return ((a4 & mask) >>> 0) === ((n4 & mask) >>> 0);
  }
  const a6 = parseIp6(ip);
  const n6 = parseIp6(net);
  if (a6 !== undefined && n6 !== undefined) {
    const p = prefix ?? 128;
    if (p < 0 || p > 128) return false;
    if (p === 0) return true;
    const shift = BigInt(128 - p);
    return a6 >> shift === n6 >> shift;
  }
  return false;
}
