import { describe, it, expect } from "vitest";
import { humanSize, statusColor, prettyJson, isJsonContentType } from "./format.js";

describe("humanSize", () => {
  it("formats bytes, KB and MB", () => {
    expect(humanSize(512)).toBe("512 B");
    expect(humanSize(2048)).toBe("2.0 KB");
    expect(humanSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("statusColor", () => {
  it("maps status ranges to colours", () => {
    expect(statusColor(204)).toBe("green");
    expect(statusColor(301)).toBe("cyan");
    expect(statusColor(404)).toBe("yellow");
    expect(statusColor(500)).toBe("red");
  });
});

describe("prettyJson", () => {
  it("equals JSON.stringify with 2-space indent when colour is off", () => {
    const v = { a: 1, b: [true, "x"], c: null };
    expect(prettyJson(v, false)).toBe(JSON.stringify(v, null, 2));
  });

  it("adds ANSI codes when colour is on", () => {
    const out = prettyJson({ a: 1 }, true);
    expect(out).toContain("\x1b[");
    // Strip ANSI and confirm the structure is preserved.
    const stripped = out.replace(/\x1b\[[0-9;]*m/g, "");
    expect(stripped).toBe(JSON.stringify({ a: 1 }, null, 2));
  });
});

describe("isJsonContentType", () => {
  it("detects json content types", () => {
    expect(isJsonContentType("application/json; charset=utf-8")).toBe(true);
    expect(isJsonContentType("text/html")).toBe(false);
    expect(isJsonContentType(undefined)).toBe(false);
  });
});
