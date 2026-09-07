import { describe, it, expect } from "vitest";
import { findKeyUsage, reconcile } from "./usage.js";

describe("findKeyUsage", () => {
  it("finds t()/i18n.t/$t calls", () => {
    const code = `t("a.b"); i18n.t('c.d'); const x = $t("e.f");`;
    expect(findKeyUsage(code).used).toEqual(["a.b", "c.d", "e.f"]);
  });

  it("finds <Trans i18nKey=…> attributes", () => {
    const code = `<Trans i18nKey="hello.world" />`;
    expect(findKeyUsage(code).used).toContain("hello.world");
  });

  it("counts dynamic usages separately", () => {
    const r = findKeyUsage("t(key); t('static'); t(`x.${id}`)");
    expect(r.used).toEqual(["static"]);
    expect(r.dynamic).toBe(2);
  });

  it("respects custom function names", () => {
    const r = findKeyUsage('translate("greeting")', ["translate"]);
    expect(r.used).toEqual(["greeting"]);
  });
});

describe("reconcile", () => {
  const baseKeys = ["a", "b", "c"];

  it("reports dead and undefined keys", () => {
    const r = reconcile(baseKeys, ["a", "z"]);
    expect(r.dead).toEqual(["b", "c"]);
    expect(r.undefinedKeys).toEqual(["z"]);
  });

  it("treats everything used and defined as clean", () => {
    const r = reconcile(baseKeys, ["a", "b", "c"]);
    expect(r.dead).toEqual([]);
    expect(r.undefinedKeys).toEqual([]);
  });

  it("honours an ignore pattern list", () => {
    const r = reconcile(["admin.x", "a"], ["a", "admin.y"], ["admin.*"]);
    expect(r.dead).toEqual([]); // admin.x ignored
    expect(r.undefinedKeys).toEqual([]); // admin.y ignored
  });

  it("accepts an ignore matcher function", () => {
    const r = reconcile(["a", "b"], ["a"], (k) => k === "b");
    expect(r.dead).toEqual([]);
  });
});
