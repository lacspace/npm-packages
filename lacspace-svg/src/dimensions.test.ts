import { describe, it, expect } from "vitest";
import { dimensions, fixDimensions } from "./dimensions.js";

describe("dimensions", () => {
  it("reads width, height and viewBox", () => {
    const d = dimensions(`<svg width="24" height="24" viewBox="0 0 24 24"><rect/></svg>`);
    expect(d.width).toBe("24");
    expect(d.height).toBe("24");
    expect(d.viewBox).toBe("0 0 24 24");
    expect(d.viewBoxValues).toEqual([0, 0, 24, 24]);
  });

  it("returns an empty object when there is no <svg>", () => {
    expect(dimensions(`<div/>`)).toEqual({});
  });

  it("omits viewBoxValues for a malformed viewBox", () => {
    const d = dimensions(`<svg viewBox="0 0 24"><rect/></svg>`);
    expect(d.viewBox).toBe("0 0 24");
    expect(d.viewBoxValues).toBeUndefined();
  });
});

describe("fixDimensions", () => {
  it("derives a missing viewBox from width/height", () => {
    const r = fixDimensions(`<svg width="32" height="16"><rect/></svg>`);
    expect(r.viewBox).toBe("0 0 32 16");
    expect(r.changed).toBe(true);
    expect(r.data).toContain('viewBox="0 0 32 16"');
  });

  it("derives missing width/height from the viewBox", () => {
    const r = fixDimensions(`<svg viewBox="0 0 48 24"><rect/></svg>`);
    expect(r.width).toBe("48");
    expect(r.height).toBe("24");
    expect(r.changed).toBe(true);
  });

  it("accepts px units when deriving a viewBox", () => {
    const r = fixDimensions(`<svg width="10px" height="10px"><rect/></svg>`);
    expect(r.viewBox).toBe("0 0 10 10");
  });

  it("leaves a complete svg unchanged", () => {
    const r = fixDimensions(`<svg width="24" height="24" viewBox="0 0 24 24"><rect/></svg>`);
    expect(r.changed).toBe(false);
  });

  it("honours addViewBox:false", () => {
    const r = fixDimensions(`<svg width="8" height="8"><rect/></svg>`, { addViewBox: false });
    expect(r.viewBox).toBeUndefined();
    expect(r.changed).toBe(false);
  });
});
