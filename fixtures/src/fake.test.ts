import { beforeEach, describe, expect, it } from "vitest";
import {
  defineFactory,
  fake,
  makeFaker,
  makeRng,
  mulberry32,
  resetSequences,
  seed,
} from "./index";

describe("makeFaker() seeded data", () => {
  it("is deterministic for the same underlying stream", () => {
    const a = makeFaker(makeRng(mulberry32(7)));
    const b = makeFaker(makeRng(mulberry32(7)));
    expect(a.fullName()).toBe(b.fullName());
    expect(a.email()).toBe(b.email());
    expect(a.city()).toBe(b.city());
  });

  it("produces a valid-looking email", () => {
    const f = makeFaker(makeRng(mulberry32(1)));
    expect(f.email()).toMatch(/^[a-z0-9.]+@[a-z0-9.]+\.[a-z]+$/);
  });

  it("honours email local/domain overrides", () => {
    const f = makeFaker(makeRng(mulberry32(2)));
    expect(f.email({ local: "ada", domain: "lacspace.com" })).toBe("ada@lacspace.com");
  });

  it("phone() is E.164-shaped", () => {
    const f = makeFaker(makeRng(mulberry32(3)));
    expect(f.phone()).toMatch(/^\+1\d{10}$/);
  });

  it("uuid() matches the v4 shape", () => {
    const f = makeFaker(makeRng(mulberry32(4)));
    expect(f.uuid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("hexColor(), ipv4() and mac() are well-formed", () => {
    const f = makeFaker(makeRng(mulberry32(5)));
    expect(f.hexColor()).toMatch(/^#[0-9a-f]{6}$/);
    expect(f.ipv4()).toMatch(/^\d{1,3}(\.\d{1,3}){3}$/);
    expect(f.mac()).toMatch(/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/);
  });

  it("words()/sentence()/slug() honour counts and shapes", () => {
    const f = makeFaker(makeRng(mulberry32(6)));
    expect(f.words(4).split(" ")).toHaveLength(4);
    expect(f.sentence(5)).toMatch(/^[A-Z].*\.$/);
    expect(f.slug(3).split("-")).toHaveLength(3);
  });

  it("id() has the requested length and alphabet", () => {
    const f = makeFaker(makeRng(mulberry32(8)));
    const id = f.id(12);
    expect(id).toHaveLength(12);
    expect(id).toMatch(/^[a-z0-9]+$/);
  });

  it("dateBetween() stays within the range", () => {
    const f = makeFaker(makeRng(mulberry32(9)));
    const start = new Date("2020-01-01");
    const end = new Date("2020-12-31");
    for (let i = 0; i < 20; i++) {
      const d = f.dateBetween(start, end);
      expect(d.getTime()).toBeGreaterThanOrEqual(start.getTime());
      expect(d.getTime()).toBeLessThanOrEqual(end.getTime());
    }
  });

  it("pastDate() is before now and futureDate() after", () => {
    const f = makeFaker(makeRng(mulberry32(10)));
    const now = Date.now();
    expect(f.pastDate().getTime()).toBeLessThanOrEqual(now);
    expect(f.futureDate().getTime()).toBeGreaterThanOrEqual(now);
  });
});

describe("ctx.fake inside a factory", () => {
  beforeEach(() => {
    seed(2024);
    resetSequences();
  });

  it("is reproducible per (seed, sequence)", () => {
    const user = defineFactory({
      name: "faker-user",
      build: (ctx) => ({
        name: ctx.fake.fullName(),
        email: ctx.fake.email(),
      }),
    });
    const a = user.build();
    seed(2024);
    resetSequences();
    const b = user.build();
    expect(b).toEqual(a);
    expect(a.email).toContain("@");
  });
});

describe("global fake", () => {
  it("restarts on resetSequences() after re-seeding", () => {
    seed(99);
    resetSequences();
    const first = fake.fullName();
    seed(99);
    resetSequences();
    expect(fake.fullName()).toBe(first);
  });
});
