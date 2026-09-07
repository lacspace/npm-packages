import { describe, it, expect } from "vitest";
import { detectLicense, detectLicenseInfo, licenseMatches, sameLicense, normalizeLicenseText } from "./detect.js";
import { generateLicense } from "./generate.js";

describe("detectLicense — identify a LICENSE text", () => {
  it("detects MIT from a filled MIT licence", () => {
    const text = generateLicense("MIT", { holder: "Lacspace", year: 2026 }).text;
    expect(detectLicense(text)).toBe("MIT");
  });

  it("detects Apache-2.0 and does not confuse it with MIT", () => {
    const text = generateLicense("Apache-2.0", { holder: "X", year: 2026 }).text;
    expect(detectLicense(text)).toBe("Apache-2.0");
    expect(detectLicense(text)).not.toBe("MIT");
  });

  it("detects ISC, BSD-2, BSD-3, Unlicense and the Lacspace Free Licence", () => {
    expect(detectLicense(generateLicense("ISC", { holder: "X" }).text)).toBe("ISC");
    expect(detectLicense(generateLicense("BSD-2-Clause", { holder: "X" }).text)).toBe("BSD-2-Clause");
    expect(detectLicense(generateLicense("BSD-3-Clause", { holder: "X" }).text)).toBe("BSD-3-Clause");
    expect(detectLicense(generateLicense("Unlicense").text)).toBe("Unlicense");
    expect(detectLicense(generateLicense("LacspaceFree-1.0", { holder: "Lacspace" }).text)).toBe("LacspaceFree-1.0");
  });

  it("is robust to CRLF and re-wrapped whitespace", () => {
    const mit = generateLicense("MIT", { holder: "X", year: 2026 }).text;
    const crlf = mit.replace(/\n/g, "\r\n");
    const rewrapped = mit.replace(/\s+/g, "  "); // collapse/expand whitespace
    expect(detectLicense(crlf)).toBe("MIT");
    expect(detectLicense(rewrapped)).toBe("MIT");
  });

  it("returns null for unknown text", () => {
    expect(detectLicense("this is not a licence at all, just prose.")).toBeNull();
  });

  it("detects the classic (unwrapped) MIT layout", () => {
    const classic = `MIT License

Copyright (c) 2026 Someone

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
`;
    expect(detectLicense(classic)).toBe("MIT");
  });
});

describe("licenseMatches / sameLicense", () => {
  it("matches a text against an expected id", () => {
    const text = generateLicense("MIT", { holder: "X" }).text;
    expect(licenseMatches(text, "MIT")).toBe(true);
    expect(licenseMatches(text, "Apache-2.0")).toBe(false);
  });

  it("treats GPL-3.0 and GPL-3.0-only as the same licence", () => {
    expect(sameLicense("GPL-3.0", "GPL-3.0-only")).toBe(true);
    expect(sameLicense("MIT", "MIT")).toBe(true);
    expect(sameLicense("MIT", "ISC")).toBe(false);
  });
});

describe("detectLicenseInfo — confidence scoring", () => {
  it("returns spdx + full confidence + name for an exact MIT text", () => {
    const info = detectLicenseInfo(generateLicense("MIT", { holder: "X", year: 2026 }).text);
    expect(info.spdx).toBe("MIT");
    expect(info.confidence).toBe(1);
    expect(info.name).toBe("MIT License");
  });

  it("identifies Apache-2.0 with a name", () => {
    const info = detectLicenseInfo(generateLicense("Apache-2.0", { holder: "X" }).text);
    expect(info.spdx).toBe("Apache-2.0");
    expect(info.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("returns null spdx and low confidence for non-licence prose", () => {
    const info = detectLicenseInfo("just some notes about the weather and nothing legal here.");
    expect(info.spdx).toBeNull();
    expect(info.confidence).toBeLessThan(0.6);
    expect(info.name).toBeNull();
  });

  it("keeps confidence within [0,1]", () => {
    const info = detectLicenseInfo(generateLicense("ISC", { holder: "X" }).text);
    expect(info.confidence).toBeGreaterThan(0);
    expect(info.confidence).toBeLessThanOrEqual(1);
  });

  it("still identifies MIT wrapped in extra preamble/notes", () => {
    const mit = generateLicense("MIT", { holder: "X", year: 2026 }).text;
    const wrapped = `Project Foo\n===========\n\n${mit}\n\nSee also NOTICE for attributions.\n`;
    const info = detectLicenseInfo(wrapped);
    expect(info.spdx).toBe("MIT");
    expect(info.confidence).toBe(1);
  });

  it("distinguishes AGPL-3.0 from GPL-3.0", () => {
    expect(detectLicenseInfo(generateLicense("AGPL-3.0-only").text).spdx).toBe("AGPL-3.0-only");
    expect(detectLicenseInfo(generateLicense("GPL-3.0-only").text).spdx).toBe("GPL-3.0-only");
  });
});

describe("normalizeLicenseText", () => {
  it("collapses whitespace and lowercases", () => {
    expect(normalizeLicenseText("A\r\n  B\tC\n")).toBe("a b c");
  });
});
