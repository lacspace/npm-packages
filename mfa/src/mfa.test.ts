import { test, expect } from "vitest";
import { assuranceLevel, mfaSession, MfaSession } from "./index";

test("assuranceLevel returns consistent AAL for factor-type combinations", () => {
  expect(assuranceLevel(["knowledge"])).toBe(1);
  expect(assuranceLevel(["knowledge", "knowledge"])).toBe(1); // not distinct
  expect(assuranceLevel(["knowledge", "possession"])).toBe(2);
  expect(assuranceLevel(["knowledge", "inherence"])).toBe(3);
  expect(assuranceLevel(["possession", "inherence"])).toBe(3);
  expect(assuranceLevel(["knowledge", "possession", "inherence"])).toBe(3);
});

test("session: single factor does not satisfy a 2-factor policy", () => {
  const s = mfaSession({
    factors: [
      { id: "password", type: "knowledge" },
      { id: "totp", type: "possession" },
    ],
    policy: { minFactors: 2 },
  });
  let state = s.markVerified("password");
  expect(state.satisfied).toBe(false);
  expect(state.needFactors).toBe(1);
  expect(state.aal).toBe(1);

  state = s.markVerified("totp");
  expect(state.satisfied).toBe(true);
  expect(state.needFactors).toBe(0);
  expect(state.aal).toBe(2);
});

test("session: requiredTypes must all be present", () => {
  const s = mfaSession({
    factors: [
      { id: "password", type: "knowledge" },
      { id: "passkey", type: "inherence" },
    ],
    policy: { minFactors: 2, requiredTypes: ["inherence"], minAAL: 3 },
  });
  s.markVerified("password");
  expect(s.satisfied).toBe(false);
  const state = s.markVerified("passkey");
  expect(state.needTypes).toEqual([]);
  expect(state.aal).toBe(3);
  expect(state.satisfied).toBe(true);
});

test("markVerified rejects an unregistered factor", () => {
  const s = mfaSession({ factors: [{ id: "password", type: "knowledge" }] });
  expect(() => s.markVerified("ghost")).toThrow();
});

test("session serializes and restores", () => {
  const config = {
    factors: [
      { id: "password", type: "knowledge" as const },
      { id: "totp", type: "possession" as const },
    ],
    policy: { minFactors: 2 },
  };
  const s = mfaSession(config);
  s.markVerified("password");
  s.markVerified("totp");
  const json = s.toJSON();
  const restored = MfaSession.fromJSON(config, json);
  expect(restored.satisfied).toBe(true);
  expect(restored.aal).toBe(2);
});
