/**
 * Modified UTF-7 for mailbox names (RFC 3501 §5.1.3).
 * Printable ASCII (0x20–0x7e) stands for itself, "&" is "&-", everything else is
 * "&" + base64 (with "," for "/", no padding) of UTF-16BE + "-".
 */

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+,";

function encodeChunk(units: number[]): string {
  const bytes: number[] = [];
  for (const u of units) bytes.push(u >> 8, u & 0xff);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 !== undefined) out += B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 !== undefined) out += B64[b2 & 63];
  }
  return out;
}

export function encodeModifiedUtf7(input: string): string {
  let out = "";
  let pending: number[] = [];
  const flush = () => {
    if (pending.length) {
      out += "&" + encodeChunk(pending) + "-";
      pending = [];
    }
  };
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    if (c >= 0x20 && c <= 0x7e) {
      flush();
      out += c === 0x26 ? "&-" : input[i];
    } else {
      pending.push(c); // UTF-16 code units, surrogates included
    }
  }
  flush();
  return out;
}

export function decodeModifiedUtf7(input: string): string {
  let out = "";
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (ch !== "&") {
      out += ch;
      i++;
      continue;
    }
    const end = input.indexOf("-", i + 1);
    if (end === -1) {
      // malformed: keep the rest verbatim
      out += input.slice(i);
      break;
    }
    const b64 = input.slice(i + 1, end);
    i = end + 1;
    if (b64 === "") {
      out += "&";
      continue;
    }
    let bits = 0;
    let acc = 0;
    const bytes: number[] = [];
    let ok = true;
    for (const c of b64) {
      const v = B64.indexOf(c);
      if (v === -1) {
        ok = false;
        break;
      }
      acc = (acc << 6) | v;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((acc >> bits) & 0xff);
      }
    }
    if (!ok) {
      out += "&" + b64 + "-";
      continue;
    }
    for (let j = 0; j + 1 < bytes.length; j += 2) out += String.fromCharCode((bytes[j]! << 8) | bytes[j + 1]!);
  }
  return out;
}
