import { describe, it, expect, vi, beforeEach } from "vitest";
import { createConsent, parseConsentCookie, whenConsent } from "./core";

// jsdom-free: emulate just enough localStorage + document.cookie in node.
function installBrowserStubs() {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  let cookie = "";
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      get cookie() {
        return cookie;
      },
      set cookie(v: string) {
        // naive: keep only the "k=v" part, honor max-age=0 as delete
        const [pair] = v.split(";");
        const [k, val] = pair!.split("=");
        if (/max-age=0/.test(v)) cookie = "";
        else cookie = `${k}=${val}`;
      },
    },
  });
  return { store };
}

beforeEach(() => {
  installBrowserStubs();
});

describe("createConsent", () => {
  it("starts undecided with all optional categories off", () => {
    const c = createConsent();
    expect(c.decided()).toBe(false);
    expect(c.has("analytics")).toBe(false);
    expect(c.has("necessary")).toBe(true);
  });

  it("acceptAll grants everything and marks decided", () => {
    const c = createConsent();
    c.acceptAll();
    expect(c.decided()).toBe(true);
    expect(c.has("analytics")).toBe(true);
    expect(c.has("marketing")).toBe(true);
    expect(c.get().decidedAt).toBeTruthy();
  });

  it("rejectAll denies optional categories but keeps necessary", () => {
    const c = createConsent();
    c.rejectAll();
    expect(c.has("analytics")).toBe(false);
    expect(c.has("necessary")).toBe(true);
    expect(c.decided()).toBe(true);
  });

  it("set merges a partial choice", () => {
    const c = createConsent();
    c.set({ analytics: true });
    expect(c.has("analytics")).toBe(true);
    expect(c.has("marketing")).toBe(false);
  });

  it("persists to a cookie the server can read", () => {
    const c = createConsent();
    c.set({ analytics: true });
    const parsed = parseConsentCookie(document.cookie);
    expect(parsed?.analytics).toBe(true);
    expect(parsed?.decidedAt).toBeTruthy();
  });

  it("rehydrates a new manager from storage", () => {
    const a = createConsent();
    a.set({ marketing: true });
    const b = createConsent();
    expect(b.has("marketing")).toBe(true);
    expect(b.decided()).toBe(true);
  });

  it("reset clears the decision", () => {
    const c = createConsent();
    c.acceptAll();
    c.reset();
    expect(c.decided()).toBe(false);
    expect(c.has("analytics")).toBe(false);
  });

  it("notifies subscribers on change", () => {
    const c = createConsent();
    const cb = vi.fn();
    const off = c.subscribe(cb);
    c.acceptAll();
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    c.rejectAll();
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe("parseConsentCookie", () => {
  it("returns null when absent or malformed", () => {
    expect(parseConsentCookie("")).toBeNull();
    expect(parseConsentCookie("lacspace-consent=%7Bbad")).toBeNull();
    expect(parseConsentCookie("other=1")).toBeNull();
  });
});

describe("whenConsent", () => {
  it("runs immediately if already granted", () => {
    const c = createConsent();
    c.set({ analytics: true });
    const fn = vi.fn();
    whenConsent(c, "analytics", fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("defers until the category becomes granted, then fires once", () => {
    const c = createConsent();
    const fn = vi.fn();
    whenConsent(c, "marketing", fn);
    expect(fn).not.toHaveBeenCalled();
    c.set({ marketing: true });
    expect(fn).toHaveBeenCalledTimes(1);
    c.set({ marketing: true }); // no double-fire
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
