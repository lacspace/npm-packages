import { test, expect } from "vitest";
import {
  securityHeaders,
  permissionsPolicy,
  reportingEndpoints,
  cspHash,
  parseCsp,
  serializeCsp,
  mergeCsp,
  withNonce,
  withHashes,
  generateNonce,
  strictPreset,
  apiPreset,
} from "./index";

/* ------------------------- Permissions-Policy ------------------------- */

test("permissionsPolicy serializes disabled, self, wildcard and origin lists", () => {
  const out = permissionsPolicy({
    camera: false,
    geolocation: "self",
    fullscreen: true,
    microphone: ["self", "https://meet.example.com"],
    displayCapture: "*",
  });
  expect(out).toContain("camera=()");
  expect(out).toContain("geolocation=(self)");
  expect(out).toContain("fullscreen=*");
  expect(out).toContain('microphone=(self "https://meet.example.com")');
  // camelCase key → kebab-case feature name
  expect(out).toContain("display-capture=*");
  expect(out.split(", ").length).toBe(5);
});

test("permissionsPolicy empty array disables a feature", () => {
  expect(permissionsPolicy({ usb: [] })).toBe("usb=()");
});

test("securityHeaders accepts typed permissionsPolicy directives", () => {
  const h = securityHeaders({ permissionsPolicy: { camera: false, geolocation: "self" } });
  expect(h["Permissions-Policy"]).toBe("camera=(), geolocation=(self)");
});

test("securityHeaders still accepts a Permissions-Policy string (back-compat)", () => {
  const h = securityHeaders({ permissionsPolicy: "camera=(), microphone=()" });
  expect(h["Permissions-Policy"]).toBe("camera=(), microphone=()");
});

/* ------------------------- COOP / COEP / CORP ------------------------- */

test("COEP and CORP are opt-in and serialize when provided", () => {
  const plain = securityHeaders();
  expect(plain["Cross-Origin-Embedder-Policy"]).toBeUndefined();
  expect(plain["Cross-Origin-Resource-Policy"]).toBeUndefined();

  const iso = securityHeaders({
    crossOriginEmbedderPolicy: "require-corp",
    crossOriginResourcePolicy: "same-origin",
  });
  expect(iso["Cross-Origin-Opener-Policy"]).toBe("same-origin");
  expect(iso["Cross-Origin-Embedder-Policy"]).toBe("require-corp");
  expect(iso["Cross-Origin-Resource-Policy"]).toBe("same-origin");
});

/* --------------------------- Reporting API --------------------------- */

test("reportingEndpoints + Report-To serialize into headers", () => {
  expect(reportingEndpoints({ default: "https://r.example.com/csp" })).toBe(
    'default="https://r.example.com/csp"',
  );
  const h = securityHeaders({
    reportingEndpoints: { default: "https://r.example.com/csp" },
    reportTo: { group: "default", max_age: 10886400, endpoints: [{ url: "https://r.example.com" }] },
  });
  expect(h["Reporting-Endpoints"]).toBe('default="https://r.example.com/csp"');
  expect(JSON.parse(h["Report-To"]!).group).toBe("default");
});

/* ------------------------- CSP report-only --------------------------- */

test("contentSecurityPolicyReportOnly emits the report-only header", () => {
  const h = securityHeaders({
    contentSecurityPolicyReportOnly: { defaultSrc: ["'self'"], reportUri: ["/csp-report"] },
  });
  expect(h["Content-Security-Policy-Report-Only"]).toContain("default-src 'self'");
  expect(h["Content-Security-Policy-Report-Only"]).toContain("report-uri /csp-report");
  // does not leak into the enforcing header
  expect(h["Content-Security-Policy"]).toBeUndefined();
});

/* ----------------------------- nonce/hash ---------------------------- */

test("generateNonce is CSPRNG-backed and unique across calls", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 100; i++) seen.add(generateNonce());
  expect(seen.size).toBe(100);
});

test("cspHash returns the known sha256 of a fixed snippet", async () => {
  // SHA-256("") — a well-known constant.
  expect(await cspHash("")).toBe("sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=");
  // deterministic for a real inline snippet, sha384/sha512 prefixes honored
  const a = await cspHash("alert('hi')");
  const b = await cspHash("alert('hi')");
  expect(a).toBe(b);
  expect(a.startsWith("sha256-")).toBe(true);
  expect((await cspHash("x", "sha384")).startsWith("sha384-")).toBe(true);
  expect((await cspHash("x", "sha512")).startsWith("sha512-")).toBe(true);
});

test("withNonce injects a nonce into script-src & style-src", () => {
  const nonce = generateNonce();
  const out = withNonce("default-src 'self'; script-src 'self'", nonce);
  expect(out).toContain(`script-src 'self' 'nonce-${nonce}'`);
  expect(out).toContain(`style-src 'nonce-${nonce}'`); // created when absent
});

test("withHashes injects hash sources into script-src", async () => {
  const hash = await cspHash("alert('Hello, world.');");
  const out = withHashes("script-src 'self'", [hash]);
  expect(out).toContain(`script-src 'self' '${hash}'`);
});

/* -------------------------- parse/merge/round-trip -------------------------- */

test("parseCsp → serializeCsp round-trips a policy", () => {
  const src = "default-src 'self'; script-src 'self' https:; upgrade-insecure-requests";
  const parsed = parseCsp(src);
  expect(parsed["default-src"]).toEqual(["'self'"]);
  expect(parsed["script-src"]).toEqual(["'self'", "https:"]);
  expect(parsed["upgrade-insecure-requests"]).toEqual([]); // valueless flag
  expect(serializeCsp(parsed)).toBe(src);
});

test("mergeCsp unions sources per directive without duplicates", () => {
  const merged = mergeCsp(
    "default-src 'self'; script-src 'self'",
    "script-src 'self' https://cdn.example.com; img-src 'self'",
  );
  expect(merged["script-src"]).toEqual(["'self'", "https://cdn.example.com"]);
  expect(merged["default-src"]).toEqual(["'self'"]);
  expect(merged["img-src"]).toEqual(["'self'"]);
  expect(serializeCsp(merged)).toContain("script-src 'self' https://cdn.example.com");
});

/* ------------------------------ presets ------------------------------ */

test("strictPreset contains the expected hardening directives", () => {
  const h = strictPreset({ nonce: "abc123" });
  const csp = h["Content-Security-Policy"];
  expect(csp).toContain("'strict-dynamic'");
  expect(csp).toContain("'nonce-abc123'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("upgrade-insecure-requests");
  expect(csp).not.toContain("'unsafe-inline'"); // nonce path drops unsafe-inline
  expect(h["Strict-Transport-Security"]).toContain("preload");
  expect(h["Cross-Origin-Opener-Policy"]).toBe("same-origin");
  expect(h["Cross-Origin-Embedder-Policy"]).toBe("require-corp");
  expect(h["Cross-Origin-Resource-Policy"]).toBe("same-origin");
  expect(h["X-Frame-Options"]).toBe("DENY");
  expect(h["Referrer-Policy"]).toBe("no-referrer");
});

test("strictPreset without a nonce falls back to unsafe-inline styles + wires reporting", () => {
  const h = strictPreset({ reportUri: "/csp", reportTo: "csp-endpoint" });
  expect(h["Content-Security-Policy"]).toContain("report-uri /csp");
  expect(h["Content-Security-Policy"]).toContain("report-to csp-endpoint");
  expect(h["Content-Security-Policy"]).toContain("'unsafe-inline'");
});

test("apiPreset is a locked-down set for JSON endpoints", () => {
  const h = apiPreset();
  expect(h["Content-Security-Policy"]).toContain("default-src 'none'");
  expect(h["X-Frame-Options"]).toBe("DENY");
  expect(h["Cross-Origin-Resource-Policy"]).toBe("same-site");
  expect(h["Referrer-Policy"]).toBe("no-referrer");
});
