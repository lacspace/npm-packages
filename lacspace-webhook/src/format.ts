/**
 * Terminal pretty-printing for captured requests and summaries.
 */
import type { CapturedRequest } from "./capture.js";
import { parseBody } from "./capture.js";
import type { VerifyResult } from "./verify.js";

export const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m",
  red: "\x1b[31m", magenta: "\x1b[35m", blue: "\x1b[34m",
};
export const c = (k: keyof typeof C, s: string): string => `${C[k]}${s}${C.reset}`;

/** Human byte size, e.g. `1.2 KB`. */
export function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** A short method colour. */
function methodColor(method: string): keyof typeof C {
  switch (method.toUpperCase()) {
    case "GET": return "green";
    case "POST": return "cyan";
    case "PUT": case "PATCH": return "yellow";
    case "DELETE": return "red";
    default: return "magenta";
  }
}

/**
 * A readable multi-line block for one captured request, including a parsed body
 * and (optionally) the outcome of a signature check.
 */
export function formatCapture(record: CapturedRequest, verify?: VerifyResult): string {
  const lines: string[] = [];
  const mc = methodColor(record.method);
  lines.push(
    `${c("bold", c(mc, record.method))} ${c("bold", record.path)} ` +
    `${c("dim", `· ${humanBytes(record.bytes)} · ${new Date(record.at).toLocaleTimeString()}`)}`,
  );

  if (Object.keys(record.query).length > 0) {
    lines.push(c("dim", "  query"));
    for (const [k, v] of Object.entries(record.query)) {
      lines.push(`    ${c("cyan", k)} ${c("dim", "=")} ${Array.isArray(v) ? v.join(", ") : v}`);
    }
  }

  lines.push(c("dim", "  headers"));
  for (const [k, v] of Object.entries(record.headers)) {
    if (v === undefined) continue;
    lines.push(`    ${c("cyan", k)}${c("dim", ":")} ${Array.isArray(v) ? v.join(", ") : v}`);
  }

  if (verify) {
    lines.push(
      verify.ok
        ? `  ${c("green", "✔ signature verified")}`
        : `  ${c("red", "✗ signature failed")} ${c("dim", `— ${verify.reason ?? "invalid"}`)}`,
    );
  }

  const parsed = parseBody(record.body, record.contentType);
  if (parsed.kind === "empty") {
    lines.push(c("dim", "  body (empty)"));
  } else if (parsed.kind === "json") {
    lines.push(c("dim", "  body (json)"));
    lines.push(indent(JSON.stringify(parsed.data, null, 2), 4));
  } else if (parsed.kind === "form") {
    lines.push(c("dim", "  body (form)"));
    for (const [k, v] of Object.entries(parsed.data as Record<string, string | string[]>)) {
      lines.push(`    ${c("cyan", k)} ${c("dim", "=")} ${Array.isArray(v) ? v.join(", ") : v}`);
    }
  } else {
    lines.push(c("dim", "  body (text)"));
    lines.push(indent(String(parsed.data), 4));
  }

  return lines.join("\n");
}

function indent(s: string, n: number): string {
  const pad = " ".repeat(n);
  return s.split("\n").map((l) => c("dim", pad + l)).join("\n");
}

/** One line summarizing a capture, for the `list` command. */
export function summaryLine(record: CapturedRequest, index: number): string {
  const mc = methodColor(record.method);
  const ct = record.contentType ?? "—";
  return (
    `${c("dim", String(index).padStart(3))}  ` +
    `${c(mc, record.method.padEnd(6))} ${record.path.padEnd(28).slice(0, 28)} ` +
    `${c("dim", ct.padEnd(30).slice(0, 30))} ` +
    `${c("dim", humanBytes(record.bytes).padStart(8))}  ` +
    `${c("dim", new Date(record.at).toLocaleString())}`
  );
}
