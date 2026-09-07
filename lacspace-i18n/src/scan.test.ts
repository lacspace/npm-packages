import { describe, it, expect } from "vitest";
import { scanSource, crossReference, makeIgnoreMatcher } from "./scan.js";
import type { ScanResult } from "./scan.js";

const DEFAULT_FUNCS = ["t", "$t", "i18n.t", "i18nKey"];

function scan(code: string, funcs = DEFAULT_FUNCS): ScanResult {
  const r: ScanResult = { used: new Set(), dynamic: 0, files: 0 };
  scanSource(code, funcs, r);
  return r;
}

describe("scanSource", () => {
  const code = `
    t("home.title");
    t('home.subtitle');
    i18n.t(\`nav.about\`);
    $t("footer.copy");
    const x = <Trans i18nKey="cta.signup">Sign up</Trans>;
    t(dynamicKey);
    t("a" + b);
  `;

  it("extracts static keys from t()/i18n.t/$t and i18nKey", () => {
    const r = scan(code);
    expect([...r.used].sort()).toEqual(["cta.signup", "footer.copy", "home.subtitle", "home.title", "nav.about"]);
  });

  it("counts dynamic (unresolvable) usages", () => {
    expect(scan(code).dynamic).toBe(2);
  });

  it("does not double-count t inside i18n.t or $t", () => {
    const r = scan("i18n.t('a.b'); $t('c.d');");
    expect([...r.used].sort()).toEqual(["a.b", "c.d"]);
  });

  it("supports custom func names", () => {
    const r = scan("translate('x.y'); tr('z')", ["translate", "tr"]);
    expect([...r.used].sort()).toEqual(["x.y", "z"]);
  });
});

describe("makeIgnoreMatcher", () => {
  it("matches glob prefixes and dotted prefixes", () => {
    const m = makeIgnoreMatcher(["admin.*", "errors"]);
    expect(m("admin.panel.title")).toBe(true);
    expect(m("errors.notFound")).toBe(true);
    expect(m("errors")).toBe(true);
    expect(m("home.title")).toBe(false);
  });

  it("empty patterns match nothing", () => {
    expect(makeIgnoreMatcher([])("anything")).toBe(false);
  });
});

describe("crossReference", () => {
  it("finds dead and undefined keys, honouring the ignore list", () => {
    const scanResult: ScanResult = { used: new Set(["home.title", "undef.key"]), dynamic: 1, files: 3 };
    const r = crossReference(["home.title", "unused.one", "admin.panel"], scanResult, makeIgnoreMatcher(["admin.*"]));
    expect(r.dead).toEqual(["unused.one"]);
    expect(r.undefinedKeys).toEqual(["undef.key"]);
    expect(r.files).toBe(3);
    expect(r.dynamic).toBe(1);
  });
});
