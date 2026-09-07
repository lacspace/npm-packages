import { describe, expect, it } from "vitest";
import { Flags } from "./index";
import { explain } from "./explain";
import type { BooleanFlag, Context, VariantFlag } from "./index";

const ctx = (over?: Context["overrides"], attributes?: Context["attributes"]): Context => ({
  key: "user-1",
  attributes,
  overrides: over,
});

describe("explain — reason codes (boolean)", () => {
  it("kill-switch: enabled:false wins over everything", () => {
    const def: BooleanFlag = { enabled: false, rules: [{ when: { plan: "pro" }, value: true }], rollout: 100 };
    const r = explain(def, "f", { key: "u", attributes: { plan: "pro" } });
    expect(r).toEqual({ enabled: false, reason: "kill-switch" });
  });

  it("kill-switch honours a custom default", () => {
    const def: BooleanFlag = { enabled: false, default: true };
    expect(explain(def, "f", { key: "u" })).toEqual({ enabled: true, reason: "kill-switch" });
  });

  it("targeting: a matching rule → reason 'targeting'", () => {
    const def: BooleanFlag = { rollout: 0, rules: [{ when: { plan: "pro" }, value: true }] };
    const r = explain(def, "f", { key: "u", attributes: { plan: "pro" } });
    expect(r).toEqual({ enabled: true, reason: "targeting" });
  });

  it("rollout: a partial rollout → reason 'rollout'", () => {
    const def: BooleanFlag = { rollout: 50 };
    const r = explain(def, "f", { key: "user-1" });
    expect(r.reason).toBe("rollout");
    expect(typeof r.enabled).toBe("boolean");
  });

  it("default: fully-on flag with no rules → reason 'default'", () => {
    expect(explain({}, "f", { key: "u" })).toEqual({ enabled: true, reason: "default" });
    expect(explain({ rollout: 0 }, "f", { key: "u" })).toEqual({ enabled: false, reason: "default" });
  });

  it("unknown: no flag def → reason 'unknown'", () => {
    expect(explain(undefined, "nope", { key: "u" })).toEqual({ enabled: false, reason: "unknown" });
  });
});

describe("explain — overrides (QA)", () => {
  it("boolean override forces on/off and beats the kill-switch", () => {
    const def: BooleanFlag = { enabled: false };
    expect(explain(def, "f", ctx({ f: true }))).toEqual({ enabled: true, reason: "override" });
    expect(explain({}, "f", ctx({ f: false }))).toEqual({ enabled: false, reason: "override" });
  });

  it("string override forces a variant", () => {
    const def: VariantFlag = { type: "variant", variants: [{ key: "a" }, { key: "b" }] };
    expect(explain(def, "exp", ctx({ exp: "b" }))).toEqual({ enabled: true, variant: "b", reason: "override" });
  });

  it("only overrides the named flag", () => {
    expect(explain({}, "other", ctx({ f: false }))).toEqual({ enabled: true, reason: "default" });
  });
});

describe("explain — variant flags", () => {
  const def: VariantFlag = {
    type: "variant",
    variants: [{ key: "control" }, { key: "b" }],
    rules: [{ when: { staff: true }, value: "b" }],
  };

  it("targeting rule forcing a variant → reason 'targeting'", () => {
    expect(explain(def, "exp", { key: "u", attributes: { staff: true } })).toEqual({
      enabled: true,
      variant: "b",
      reason: "targeting",
    });
  });

  it("weighted assignment → reason 'rollout', value matches canonical variant()", () => {
    const flags = new Flags({ exp: def });
    const c: Context = { key: "user-99", attributes: { staff: false } };
    const r = explain(def, "exp", c);
    expect(r.reason).toBe("rollout");
    expect(r.variant).toBe(flags.variant("exp", c));
  });

  it("kill-switch returns the default variant", () => {
    const off: VariantFlag = { type: "variant", enabled: false, variants: [{ key: "a" }, { key: "b" }], default: "a" };
    expect(explain(off, "exp", { key: "u" })).toEqual({ enabled: false, variant: "a", reason: "kill-switch" });
  });
});

describe("Flags.explain method + new operators via rules", () => {
  it("store.explain matches canonical enabled and reports a reason", () => {
    const flags = new Flags({
      staff: { rollout: 0, rules: [{ when: { email: { endsWith: "@lacspace.com" } }, value: true }] },
    });
    const c: Context = { key: "u", attributes: { email: "dev@lacspace.com" } };
    const r = flags.explain("staff", c);
    expect(r).toEqual({ enabled: true, reason: "targeting" });
    expect(r.enabled).toBe(flags.isEnabled("staff", c));
    // non-staff falls through the 0% rollout
    expect(flags.explain("staff", { key: "u", attributes: { email: "x@gmail.com" } })).toEqual({
      enabled: false,
      reason: "default",
    });
  });

  it("new startsWith/predicate operators also work in the existing rules path", () => {
    const flags = new Flags({
      beta: {
        rollout: 0,
        rules: [{ when: { sku: { startsWith: "PRO-" }, seats: { predicate: (v) => typeof v === "number" && v > 3 } }, value: true }],
      },
    });
    expect(flags.isEnabled("beta", { key: "u", attributes: { sku: "PRO-1", seats: 5 } })).toBe(true);
    expect(flags.isEnabled("beta", { key: "u", attributes: { sku: "FREE-1", seats: 5 } })).toBe(false);
    expect(flags.isEnabled("beta", { key: "u", attributes: { sku: "PRO-1", seats: 2 } })).toBe(false);
  });
});
