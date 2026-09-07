import { test, expect, vi } from "vitest";
import { verifyBatch } from "./batch";
import type { MxResolver, SmtpProber } from "./index";

// Every test injects fake DNS + SMTP — no real lookup or socket, ever.

const mxFor: MxResolver = async (domain) => [{ exchange: `mx.${domain}`, priority: 10 }];

test("de-dupes MX lookups by domain within a run", async () => {
  const resolve = vi.fn<MxResolver>(mxFor);
  const emails = [
    "a@example.com",
    "b@example.com",
    "c@other.com",
    "d@example.com",
    "e@other.com",
  ];
  const results = await verifyBatch(emails, {
    resolveMxImpl: resolve,
    smtpCheckImpl: async () => "unknown",
  });
  expect(results).toHaveLength(5);
  // 5 emails but only 2 unique domains → 2 MX lookups.
  const domainsLookedUp = new Set(resolve.mock.calls.map((c) => c[0]));
  expect(domainsLookedUp).toEqual(new Set(["example.com", "other.com"]));
  expect(resolve).toHaveBeenCalledTimes(2);
});

test("returns per-email verdicts in input order", async () => {
  const smtp: SmtpProber = async (email) =>
    email.startsWith("good") ? "deliverable" : "undeliverable";
  const results = await verifyBatch(
    ["good@example.com", "bad@example.com", "good2@example.com"],
    { resolveMxImpl: mxFor, smtpCheckImpl: smtp },
  );
  expect(results.map((r) => r.email)).toEqual([
    "good@example.com",
    "bad@example.com",
    "good2@example.com",
  ]);
  expect(results[0]!.smtp).toBe("deliverable");
  expect(results[1]!.smtp).toBe("undeliverable");
  expect(results[1]!.valid).toBe(false);
});

test("respects the concurrency cap (never more than N in flight)", async () => {
  let inFlight = 0;
  let peak = 0;
  const smtp: SmtpProber = async () => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await Promise.resolve();
    await Promise.resolve();
    inFlight--;
    return "unknown";
  };
  const emails = Array.from({ length: 12 }, (_, i) => `u${i}@d${i}.com`);
  await verifyBatch(emails, {
    resolveMxImpl: mxFor,
    smtpCheckImpl: smtp,
    concurrency: 3,
  });
  expect(peak).toBeLessThanOrEqual(3);
});

test("catch-all is probed once per domain, not once per email", async () => {
  // Accept everything so every address is 'deliverable' and catch-all is probed.
  const probedRandom: string[] = [];
  const smtp: SmtpProber = async (email) => {
    if (email.startsWith("no-such-user") || email.startsWith("probe-")) {
      probedRandom.push(email);
    }
    return "deliverable";
  };
  let n = 0;
  const results = await verifyBatch(
    ["a@example.com", "b@example.com", "c@example.com"],
    {
      resolveMxImpl: mxFor,
      smtpCheckImpl: smtp,
      detectCatchAll: true,
      randomLocal: () => `probe-${n++}`,
    },
  );
  // One catch-all probe for the single unique domain, despite 3 emails.
  expect(probedRandom).toHaveLength(1);
  expect(results.every((r) => r.catchAll)).toBe(true);
});

test("empty input returns an empty array without any lookups", async () => {
  const resolve = vi.fn<MxResolver>(mxFor);
  const results = await verifyBatch([], { resolveMxImpl: resolve });
  expect(results).toEqual([]);
  expect(resolve).not.toHaveBeenCalled();
});
