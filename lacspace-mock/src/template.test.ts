import { describe, it, expect } from "vitest";
import { render, renderValue } from "./template.js";
import { createFaker } from "./faker.js";
import type { TemplateContext } from "./template.js";

function ctx(over: Partial<TemplateContext> = {}): TemplateContext {
  return {
    params: { id: "7" },
    query: { page: "2" },
    body: { email: "a@b.co", nested: { n: 5 } },
    faker: createFaker("t-seed"),
    ...over,
  };
}

describe("template", () => {
  it("substitutes params, query and body dot-paths", () => {
    expect(render("id={{params.id}} page={{query.page}} email={{body.email}}", ctx()))
      .toBe("id=7 page=2 email=a@b.co");
    expect(render("{{body.nested.n}}", ctx())).toBe("5");
  });

  it("unknown tokens resolve to empty", () => {
    expect(render("x={{nope.foo}}", ctx())).toBe("x=");
  });

  it("repeat blocks expand with index", () => {
    expect(render("{{repeat 3}}[{{index}}]{{/repeat}}", ctx())).toBe("[0][1][2]");
    expect(render("{{repeat 2}}{{index1}}{{/repeat}}", ctx())).toBe("12");
  });

  it("fake tokens produce deterministic output for a seed", () => {
    const a = render("{{fake.uuid}}", ctx());
    const b = render("{{fake.uuid}}", ctx());
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("fake.int honours args", () => {
    for (let i = 0; i < 20; i++) {
      const v = Number(render("{{fake.int 10 12}}", ctx()));
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(12);
    }
  });

  it("repeat advances the faker so rows differ", () => {
    const out = render("{{repeat 2}}{{fake.int 1 1000000}},{{/repeat}}", ctx());
    const [x, y] = out.split(",");
    expect(x).not.toBe(y);
  });

  it("renderValue deep-renders and coerces scalars", () => {
    const out = renderValue({ id: "{{params.id}}", ok: "true", tags: ["{{query.page}}"] }, ctx());
    expect(out).toEqual({ id: 7, ok: true, tags: [2] });
  });
});
