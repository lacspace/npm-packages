import { test, expect, vi } from "vitest";
import { detectCatchAll } from "./catch-all";
import type { SmtpProber } from "./index";

// Every test injects a fake SMTP prober — no socket is ever opened.

test("server that accepts a random recipient → catchAll true", async () => {
  const acceptAll: SmtpProber = async () => "deliverable";
  const isCatchAll = await detectCatchAll("example.com", "mx.example.com", {
    smtpCheckImpl: acceptAll,
  });
  expect(isCatchAll).toBe(true);
});

test("server that rejects the random recipient → catchAll false", async () => {
  const rejectAll: SmtpProber = async () => "undeliverable";
  const isCatchAll = await detectCatchAll("example.com", "mx.example.com", {
    smtpCheckImpl: rejectAll,
  });
  expect(isCatchAll).toBe(false);
});

test("an 'unknown' SMTP result is not treated as catch-all", async () => {
  const unknown: SmtpProber = async () => "unknown";
  const isCatchAll = await detectCatchAll("example.com", "mx.example.com", {
    smtpCheckImpl: unknown,
  });
  expect(isCatchAll).toBe(false);
});

test("probes a non-existent local part at the target domain and host", async () => {
  const probe = vi.fn<SmtpProber>(async () => "deliverable");
  await detectCatchAll("example.com", "mx.example.com", {
    smtpCheckImpl: probe,
    randomLocal: () => "definitely-not-real-123",
  });
  expect(probe).toHaveBeenCalledOnce();
  const [addr, host] = probe.mock.calls[0]!;
  expect(addr).toBe("definitely-not-real-123@example.com");
  expect(host).toBe("mx.example.com");
});
