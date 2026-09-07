import { test, expect, vi } from "vitest";
import { verifyEmailDeep } from "./verify-deep";
import type { MxResolver, SmtpProber } from "./index";

// Every test injects fake DNS + SMTP — no real lookup or socket, ever.

const oneMx: MxResolver = async () => [{ exchange: "mx.example.com", priority: 10 }];

test("invalid syntax → syntax false, no MX lookup, confidence 0", async () => {
  const resolve = vi.fn<MxResolver>(async () => []);
  const r = await verifyEmailDeep("not-an-email", { resolveMxImpl: resolve });
  expect(r.syntax).toBe(false);
  expect(r.confidence.score).toBe(0);
  expect(r.reason).toBe("invalid syntax");
  expect(resolve).not.toHaveBeenCalled();
});

test("no MX records → mxFound false and lowered confidence", async () => {
  const r = await verifyEmailDeep("user@example.com", {
    resolveMxImpl: async () => [],
  });
  expect(r.mxFound).toBe(false);
  expect(r.reason).toBe("no MX records for domain");
  expect(r.confidence.reasons).toContain("no MX records for domain");
});

test("MX records are ranked by priority (best first) regardless of resolver order", async () => {
  const unsorted: MxResolver = async () => [
    { exchange: "backup.example.com", priority: 30 },
    { exchange: "primary.example.com", priority: 5 },
  ];
  const smtp: SmtpProber = async (_email, host) =>
    host === "primary.example.com" ? "deliverable" : "unknown";
  const r = await verifyEmailDeep("user@example.com", {
    resolveMxImpl: unsorted,
    smtpCheckImpl: smtp,
  });
  expect(r.mxRecords[0]!.exchange).toBe("primary.example.com");
  expect(r.mxHost).toBe("primary.example.com");
  expect(r.smtp).toBe("deliverable");
});

test("falls back to the next MX host when the first is inconclusive", async () => {
  const two: MxResolver = async () => [
    { exchange: "primary.example.com", priority: 5 },
    { exchange: "backup.example.com", priority: 20 },
  ];
  const smtp = vi.fn<SmtpProber>(async (_email, host) =>
    host === "primary.example.com" ? "unknown" : "deliverable",
  );
  const r = await verifyEmailDeep("user@example.com", {
    resolveMxImpl: two,
    smtpCheckImpl: smtp,
  });
  expect(smtp).toHaveBeenCalledTimes(2); // tried primary, then backup
  expect(r.mxHost).toBe("backup.example.com");
  expect(r.smtp).toBe("deliverable");
});

test("checkSmtp:false skips the probe and leaves smtp 'unknown'", async () => {
  const smtp = vi.fn<SmtpProber>(async () => "deliverable");
  const r = await verifyEmailDeep("user@example.com", {
    resolveMxImpl: oneMx,
    smtpCheckImpl: smtp,
    checkSmtp: false,
  });
  expect(smtp).not.toHaveBeenCalled();
  expect(r.smtp).toBe("unknown");
  expect(r.mxFound).toBe(true);
});

test("catch-all detection flags catchAll and lowers confidence", async () => {
  // Server accepts everyone → the real address AND the random probe both pass.
  const acceptAll: SmtpProber = async () => "deliverable";
  const r = await verifyEmailDeep("user@example.com", {
    resolveMxImpl: oneMx,
    smtpCheckImpl: acceptAll,
    detectCatchAll: true,
    randomLocal: () => "random-nobody-xyz",
  });
  expect(r.smtp).toBe("deliverable");
  expect(r.catchAll).toBe(true);
  expect(r.confidence.reasons.join(" ")).toMatch(/catch-all/i);

  const noCatchAll = await verifyEmailDeep("user@example.com", {
    resolveMxImpl: oneMx,
    smtpCheckImpl: async (email) =>
      email.startsWith("random-nobody") ? "undeliverable" : "deliverable",
    detectCatchAll: true,
    randomLocal: () => "random-nobody-xyz",
  });
  expect(noCatchAll.catchAll).toBe(false);
  expect(noCatchAll.confidence.score).toBeGreaterThan(r.confidence.score);
});

test("undeliverable mailbox → valid false, reason set", async () => {
  const r = await verifyEmailDeep("user@example.com", {
    resolveMxImpl: oneMx,
    smtpCheckImpl: async () => "undeliverable",
  });
  expect(r.valid).toBe(false);
  expect(r.reason).toBe("mailbox rejected by server");
  expect(r.confidence.risk).toBe("high");
});
