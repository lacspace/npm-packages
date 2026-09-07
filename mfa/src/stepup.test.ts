import { test, expect } from "vitest";
import { mfaSession, requireStepUp } from "./index";

function baseSession() {
  return mfaSession({
    factors: [
      { id: "password", type: "knowledge" },
      { id: "totp", type: "possession" },
      { id: "passkey", type: "inherence" },
    ],
  });
}

test("step-up required when current AAL is below the action's minimum", () => {
  const s = baseSession();
  s.markVerified("password"); // AAL1
  const d = requireStepUp(s, { minAAL: 2 });
  expect(d.required).toBe(true);
  expect(d.reasons).toContain("insufficient-aal");
  expect(d.currentAAL).toBe(1);
});

test("no step-up once the policy is met", () => {
  const s = baseSession();
  s.markVerified("password");
  s.markVerified("totp"); // AAL2
  const d = requireStepUp(s, { minAAL: 2, minFactors: 2 });
  expect(d.required).toBe(false);
  expect(d.reasons).toEqual([]);
});

test("step-up on a required type that is missing", () => {
  const s = baseSession();
  s.markVerified("password");
  s.markVerified("totp");
  const d = requireStepUp(s, { requireTypes: ["inherence"] });
  expect(d.required).toBe(true);
  expect(d.reasons).toContain("missing-type");
});

test("step-up on staleness using an injected clock", () => {
  let clock = 10_000;
  const s = baseSession();
  // MfaSession stamps verification with Date.now; freeze it for the test.
  const realNow = Date.now;
  Date.now = () => clock;
  try {
    s.markVerified("password");
    s.markVerified("totp");
  } finally {
    Date.now = realNow;
  }

  const fresh = requireStepUp(s, { maxAgeMs: 5_000, now: () => 12_000 });
  expect(fresh.reasons).not.toContain("stale");
  expect(fresh.required).toBe(false);

  const stale = requireStepUp(s, { maxAgeMs: 5_000, now: () => 20_000 });
  expect(stale.required).toBe(true);
  expect(stale.reasons).toContain("stale");
  expect(stale.ageMs).toBe(10_000);
});

test("empty session is stale and undefined age", () => {
  const s = baseSession();
  const d = requireStepUp(s, { maxAgeMs: 1_000 });
  expect(d.required).toBe(true);
  expect(d.reasons).toContain("stale");
  expect(d.ageMs).toBeUndefined();
});
