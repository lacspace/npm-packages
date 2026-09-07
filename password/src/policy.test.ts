import { test, expect } from "vitest";
import { checkPolicy } from "./policy";

test("passes a compliant password", () => {
  const r = checkPolicy("gT9!qmV2xL@4wZ", {
    minLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireDigit: true,
    requireSymbol: true,
  });
  expect(r.valid).toBe(true);
  expect(r.failures).toEqual([]);
});

test("collects every failed rule", () => {
  const r = checkPolicy("hunter2", { minLength: 12, requireUppercase: true, requireSymbol: true });
  expect(r.valid).toBe(false);
  expect(r.failures).toEqual(expect.arrayContaining(["minLength", "requireUppercase", "requireSymbol"]));
});

test("maxLength and minCharClasses enforced", () => {
  expect(checkPolicy("abcdefghij", { maxLength: 5 }).failures).toContain("maxLength");
  expect(checkPolicy("alllowercase", { minCharClasses: 3 }).failures).toContain("minCharClasses");
});

test("minScore uses the estimator", () => {
  expect(checkPolicy("password", { minScore: 3 }).failures).toContain("minScore");
  expect(checkPolicy("gT9!qmV2xL@4wZ7", { minScore: 3 }).valid).toBe(true);
});

test("disallowCommon rejects well-known passwords", () => {
  expect(checkPolicy("letmein", { minLength: 1, disallowCommon: true }).failures).toContain("disallowCommon");
  expect(checkPolicy("gT9!qmV2xL@4wZ7", { disallowCommon: true }).failures).not.toContain("disallowCommon");
});

test("disallowUserInfo rejects passwords containing user info", () => {
  const r = checkPolicy("alice-secret-99", { minLength: 1, disallowUserInfo: true }, { userInputs: ["Alice"] });
  expect(r.failures).toContain("disallowUserInfo");
  const ok = checkPolicy("gT9!qmV2xL@4wZ7", { disallowUserInfo: true }, { userInputs: ["Alice"] });
  expect(ok.failures).not.toContain("disallowUserInfo");
});
