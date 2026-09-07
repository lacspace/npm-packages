import { describe, it, expect } from "vitest";
import { optimize } from "./optimize.js";

describe("optimize — remove default-valued attributes", () => {
  it("drops presentation attrs set to their SVG default", () => {
    const { data } = optimize(
      `<svg><path fill-opacity="1" stroke-linejoin="miter" stroke-dasharray="none" d="M0 0"/></svg>`,
    );
    expect(data).not.toContain("fill-opacity");
    expect(data).not.toContain("stroke-linejoin");
    expect(data).not.toContain("stroke-dasharray");
  });

  it("keeps a non-default value", () => {
    const { data } = optimize(`<svg><path fill-opacity="0.5" d="M0 0"/></svg>`);
    expect(data).toContain('fill-opacity="0.5"');
  });

  it("treats numeric equivalents as default (stroke-width 1.0)", () => {
    const { data } = optimize(`<svg><path stroke-width="1.0" d="M0 0"/></svg>`);
    expect(data).not.toContain("stroke-width");
  });

  it("can be disabled with removeDefaultAttrs:false", () => {
    const { data } = optimize(`<svg><path fill-opacity="1" d="M0 0"/></svg>`, {
      removeDefaultAttrs: false,
    });
    expect(data).toContain('fill-opacity="1"');
  });
});

describe("optimize — editor namespaces", () => {
  it("removes sketch and adobe-illustrator cruft", () => {
    const { data } = optimize(
      `<svg xmlns:sketch="s" xmlns:i="i"><rect sketch:type="a" i:knockout="b" fill="red"/></svg>`,
    );
    expect(data).not.toContain("sketch");
    expect(data).not.toContain("xmlns:i");
    expect(data).not.toContain("i:knockout");
    expect(data).toContain('fill="red"');
  });
});

describe("optimize — hoist common attributes", () => {
  it("moves an attribute shared by every child onto the group", () => {
    const { data } = optimize(`<svg><g><path fill="red" d="M0 0"/><rect fill="red"/></g></svg>`, {
      moveElemsAttrsToGroup: true,
    });
    expect(data).toContain('<g fill="red">');
    expect(data).not.toMatch(/<path[^>]*fill="red"/);
  });

  it("does not hoist when children differ", () => {
    const { data } = optimize(`<svg><g><path fill="red" d="M0 0"/><rect fill="blue"/></g></svg>`, {
      moveElemsAttrsToGroup: true,
    });
    expect(data).not.toContain('<g fill');
    expect(data).toContain('fill="red"');
    expect(data).toContain('fill="blue"');
  });

  it("is off by default", () => {
    const { data } = optimize(`<svg><g><path fill="red" d="M0 0"/><rect fill="red"/></g></svg>`);
    expect(data).not.toContain('<g fill');
  });
});

describe("optimize — addDimensions", () => {
  it("derives width/height from the viewBox when asked", () => {
    const { data } = optimize(`<svg viewBox="0 0 40 20"><rect/></svg>`, { addDimensions: true });
    expect(data).toContain('width="40"');
    expect(data).toContain('height="20"');
  });

  it("does not add dimensions by default", () => {
    const { data } = optimize(`<svg viewBox="0 0 40 20"><rect/></svg>`);
    expect(data).not.toContain('width=');
  });
});

describe("optimize — currentColor pass", () => {
  it("replaces literal colours when currentColor is enabled", () => {
    const { data } = optimize(`<svg><path fill="#ff0000" d="M0 0"/></svg>`, { currentColor: true });
    expect(data).toContain('fill="currentColor"');
  });

  it("respects a keep-list via an options object", () => {
    const { data } = optimize(`<svg><path fill="#fff" stroke="#000" d="M0 0"/></svg>`, {
      currentColor: { keep: ["#fff"] },
    });
    expect(data).toContain('fill="#fff"');
    expect(data).toContain('stroke="currentColor"');
  });

  it("leaves colours literal by default", () => {
    const { data } = optimize(`<svg><path fill="red" d="M0 0"/></svg>`);
    expect(data).toContain('fill="red"');
  });
});
