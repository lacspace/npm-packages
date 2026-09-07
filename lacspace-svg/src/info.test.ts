import { describe, it, expect } from "vitest";
import { info } from "./info.js";

describe("info", () => {
  const svg = `<svg width="24" height="24" viewBox="0 0 24 24"><g><rect id="a"/><rect/><circle/></g></svg>`;

  it("reports dimensions and viewBox", () => {
    const i = info(svg);
    expect(i.width).toBe("24");
    expect(i.height).toBe("24");
    expect(i.viewBox).toBe("0 0 24 24");
    expect(i.viewBoxValues).toEqual([0, 0, 24, 24]);
  });

  it("counts elements and ids", () => {
    const i = info(svg);
    expect(i.elements.rect).toBe(2);
    expect(i.elements.circle).toBe(1);
    expect(i.elementCount).toBe(5); // svg, g, rect, rect, circle
    expect(i.idCount).toBe(1);
  });

  it("reports byte size", () => {
    expect(info(svg).bytes).toBe(Buffer.byteLength(svg, "utf8"));
  });

  it("flags a <script> element", () => {
    const i = info(`<svg><script>alert(1)</script></svg>`);
    expect(i.hasScript).toBe(true);
    expect(i.warnings.some((w) => w.kind === "script")).toBe(true);
  });

  it("flags inline event handlers without running them", () => {
    const i = info(`<svg><rect onclick="hack()"/></svg>`);
    expect(i.warnings.some((w) => w.kind === "event-handler")).toBe(true);
  });

  it("flags external hrefs and foreignObject", () => {
    const i = info(`<svg><image href="https://evil.example/x.png"/><foreignObject/></svg>`);
    expect(i.warnings.some((w) => w.kind === "external-href")).toBe(true);
    expect(i.warnings.some((w) => w.kind === "foreign-object")).toBe(true);
  });

  it("reports a clean SVG with no warnings", () => {
    const i = info(`<svg><rect/></svg>`);
    expect(i.warnings).toHaveLength(0);
    expect(i.hasScript).toBe(false);
  });
});
