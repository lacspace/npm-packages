import { describe, it, expect } from "vitest";
import { toDataUri, encodeSvgUri, encodeSvgBase64 } from "./datauri.js";

describe("encodeSvgUri", () => {
  it("escapes #, <, > and switches double quotes to single", () => {
    const out = encodeSvgUri(`<svg fill="#fff"></svg>`);
    expect(out).toContain("%3C");
    expect(out).toContain("%3E");
    expect(out).toContain("%23fff");
    expect(out).not.toContain('"');
  });

  it("escapes percent signs first (no double-encoding)", () => {
    expect(encodeSvgUri("100%")).toBe("100%25");
  });

  it("collapses newlines and whitespace", () => {
    expect(encodeSvgUri("a\n\n  b")).toBe("a b");
  });
});

describe("encodeSvgBase64", () => {
  it("round-trips through base64", () => {
    const s = `<svg/>`;
    expect(Buffer.from(encodeSvgBase64(s), "base64").toString("utf8")).toBe(s);
  });
});

describe("toDataUri", () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect fill="#ffffff"/></svg>`;

  it("produces a URL-encoded data URI by default", () => {
    const { uri, encoding } = toDataUri(svg);
    expect(encoding).toBe("uri");
    expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
    expect(uri).toContain("%3Csvg");
  });

  it("produces a base64 data URI", () => {
    const { uri, encoding } = toDataUri(svg, { encoding: "base64" });
    expect(encoding).toBe("base64");
    expect(uri.startsWith("data:image/svg+xml;base64,")).toBe(true);
    const b64 = uri.split(",")[1]!;
    expect(Buffer.from(b64, "base64").toString("utf8")).toContain("<svg");
  });

  it("wraps as a CSS background-image when css:true", () => {
    const { output } = toDataUri(svg, { css: true });
    expect(output.startsWith('background-image: url("')).toBe(true);
    expect(output.endsWith('");')).toBe(true);
  });

  it("optimizes before encoding (colour shortened)", () => {
    const { uri } = toDataUri(svg, { encoding: "base64" });
    const decoded = Buffer.from(uri.split(",")[1]!, "base64").toString("utf8");
    expect(decoded).toContain("#fff");
  });

  it("reports byte length", () => {
    const { bytes, uri } = toDataUri(svg);
    expect(bytes).toBe(Buffer.byteLength(uri, "utf8"));
  });
});
