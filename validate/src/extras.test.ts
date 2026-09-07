import { test, expect } from "vitest";
import { v, ValidationError, type Infer } from "./index";

/* ---- new schema types ---- */

test("tuple validates fixed-length, positional schemas", () => {
  const Point = v.tuple([v.number(), v.number(), v.string()] as const);
  expect(Point.parse([1, 2, "z"])).toEqual([1, 2, "z"]);
  expect(Point.safeParse([1, 2]).success).toBe(false); // wrong length
  expect(Point.safeParse([1, "x", "z"]).success).toBe(false); // wrong element type
});

test("intersection / .and merges two object schemas", () => {
  const A = v.object({ a: v.number() });
  const B = v.object({ b: v.string() });
  const AB = v.intersection(A, B);
  expect(AB.parse({ a: 1, b: "x" })).toEqual({ a: 1, b: "x" });
  expect(AB.safeParse({ a: 1 }).success).toBe(false);
  expect(A.and(B).parse({ a: 2, b: "y" })).toEqual({ a: 2, b: "y" });
});

test("record still works; enum + literal unchanged; union ok", () => {
  const s = v.union(v.literal("a"), v.number());
  expect(s.parse("a")).toBe("a");
  expect(s.parse(5)).toBe(5);
  expect(s.safeParse(true).success).toBe(false);
});

test("discriminatedUnion selects the right branch by discriminator", () => {
  const Shape = v.discriminatedUnion("kind", [
    v.object({ kind: v.literal("circle"), radius: v.number() }),
    v.object({ kind: v.literal("rect"), w: v.number(), h: v.number() }),
  ] as const);
  expect(Shape.parse({ kind: "circle", radius: 3 })).toEqual({ kind: "circle", radius: 3 });
  expect(Shape.parse({ kind: "rect", w: 2, h: 4 })).toEqual({ kind: "rect", w: 2, h: 4 });
  // wrong branch fields fail
  expect(Shape.safeParse({ kind: "circle", w: 1, h: 2 }).success).toBe(false);
  // unknown discriminator fails with the right code
  const r = Shape.safeParse({ kind: "triangle" });
  expect(r.success).toBe(false);
  if (!r.success) expect(r.error.issues[0]!.code).toBe("invalid_union_discriminator");
});

test("lazy enables recursive schemas", () => {
  type Category = { name: string; children: Category[] };
  const Category: import("./index").Schema<Category> = v.lazy(() =>
    v.object({
      name: v.string(),
      children: v.array(Category),
    }),
  ) as unknown as import("./index").Schema<Category>;
  const tree = { name: "root", children: [{ name: "child", children: [] }] };
  expect(Category.parse(tree)).toEqual(tree);
  expect(Category.safeParse({ name: "x", children: [{ name: 1, children: [] }] }).success).toBe(false);
});

test("nativeEnum accepts enum values (string + numeric), rejects reverse maps", () => {
  const Fruit = { Apple: "apple", Banana: "banana" } as const;
  const s = v.nativeEnum(Fruit);
  expect(s.parse("apple")).toBe("apple");
  expect(s.safeParse("pear").success).toBe(false);

  enum Dir {
    Up,
    Down,
  }
  const d = v.nativeEnum(Dir);
  expect(d.parse(0)).toBe(0);
  expect(d.parse(1)).toBe(1);
  expect(d.safeParse("Up").success).toBe(false); // reverse mapping not a valid value
  expect(d.safeParse(2).success).toBe(false);
});

test("map and set validate entries", () => {
  const m = v.map(v.string(), v.number());
  const parsed = m.parse(new Map([["a", 1]]));
  expect(parsed.get("a")).toBe(1);
  expect(m.safeParse(new Map<string, unknown>([["a", "x"]])).success).toBe(false);
  expect(m.safeParse({ a: 1 }).success).toBe(false); // not a Map

  const s = v.set(v.number()).min(1);
  expect([...s.parse(new Set([1, 2]))]).toEqual([1, 2]);
  expect(s.safeParse(new Set()).success).toBe(false);
  expect(s.safeParse(new Set(["x"])).success).toBe(false);
});

test("instanceof, unknown, never, void", () => {
  const d = v.instanceof(Date);
  expect(d.parse(new Date())).toBeInstanceOf(Date);
  expect(d.safeParse("2020").success).toBe(false);

  expect(v.unknown().parse(Symbol.iterator)).toBe(Symbol.iterator);
  expect(v.never().safeParse(1).success).toBe(false);
  expect(v.void().parse(undefined)).toBe(undefined);
  expect(v.void().safeParse(1).success).toBe(false);
});

/* ---- refinements & transforms ---- */

test("superRefine can add issues with custom path", () => {
  const Passwords = v
    .object({ pw: v.string(), confirm: v.string() })
    .superRefine((val, ctx) => {
      if (val.pw !== val.confirm) ctx.addIssue({ message: "Passwords must match", path: ["confirm"] });
    });
  expect(Passwords.safeParse({ pw: "a", confirm: "a" }).success).toBe(true);
  const r = Passwords.safeParse({ pw: "a", confirm: "b" });
  expect(r.success).toBe(false);
  if (!r.success) expect(r.error.issues[0]!.path).toEqual(["confirm"]);
});

test(".catch supplies a fallback on failure, .default fills undefined", () => {
  expect(v.number().catch(0).parse("nope")).toBe(0);
  expect(v.number().catch(() => 7).parse(NaN)).toBe(7);
  expect(v.number().catch(0).parse(5)).toBe(5); // valid passes through
  expect(v.string().default("x").parse(undefined)).toBe("x");
});

test(".transform and .pipe chain output through another schema", () => {
  const trimmedLen = v.string().transform((s) => s.trim().length);
  expect(trimmedLen.parse("  hi  ")).toBe(2);

  const piped = v.coerce.number().pipe(v.number().int().positive());
  expect(piped.parse("3")).toBe(3);
  expect(piped.safeParse("-2").success).toBe(false);
});

test(".brand is a runtime no-op but preserves value", () => {
  const UserId = v.string().brand<"UserId">();
  expect(UserId.parse("abc")).toBe("abc");
  type UserId = Infer<typeof UserId>;
  const id: UserId = UserId.parse("xyz");
  expect(id).toBe("xyz");
});

/* ---- coercion ---- */

test("coerce.date and coerce.bigint", () => {
  const d = v.coerce.date().parse("2026-01-02");
  expect(d).toBeInstanceOf(Date);
  expect(v.coerce.bigint().parse("42")).toBe(42n);
  expect(v.coerce.bigint().parse(5)).toBe(5n);
  expect(v.coerce.bigint().parse(true)).toBe(1n);
  expect(v.coerce.bigint().safeParse("nope").success).toBe(false);
  expect(v.bigint().min(2n).safeParse(1n).success).toBe(false);
});

/* ---- new string / number / array checks ---- */

test("new string checks: datetime, ip, cuid", () => {
  expect(v.string().datetime().parse("2026-09-07T12:30:00.000Z")).toBeTypeOf("string");
  expect(v.string().datetime().safeParse("2026-09-07").success).toBe(false);
  expect(v.string().ip().parse("192.168.0.1")).toBe("192.168.0.1");
  expect(v.string().ip().parse("::1")).toBe("::1");
  expect(v.string().ip().safeParse("999.1.1.1").success).toBe(false);
  expect(v.string().cuid().safeParse("cjld2cjxh0000qzrmn831i7rn").success).toBe(true);
  expect(v.string().cuid().safeParse("not-a-cuid").success).toBe(false);
});

test("new number checks: negative, multipleOf (float-safe), safe", () => {
  expect(v.number().negative().safeParse(-1).success).toBe(true);
  expect(v.number().negative().safeParse(1).success).toBe(false);
  expect(v.number().multipleOf(0.1).safeParse(0.3).success).toBe(true); // float-safe
  expect(v.number().multipleOf(3).safeParse(10).success).toBe(false);
  expect(v.number().safe().safeParse(Number.MAX_SAFE_INTEGER).success).toBe(true);
  expect(v.number().safe().safeParse(Number.MAX_SAFE_INTEGER + 1).success).toBe(false);
});

test("array .length exact check", () => {
  const three = v.array(v.number()).length(3);
  expect(three.parse([1, 2, 3])).toEqual([1, 2, 3]);
  expect(three.safeParse([1, 2]).success).toBe(false);
});

/* ---- error ergonomics ---- */

test("error.format() builds a nested tree with _errors; path preserved", () => {
  const Schema = v.object({
    name: v.string().min(2),
    address: v.object({ zip: v.string().length(5) }),
  });
  const r = Schema.safeParse({ name: "a", address: { zip: "1" } });
  expect(r.success).toBe(false);
  if (!r.success) {
    const f = r.error.format();
    expect(f._errors).toEqual([]);
    expect((f.name as { _errors: string[] })._errors.length).toBe(1);
    const addr = f.address as Record<string, { _errors: string[] }>;
    expect(addr.zip!._errors.length).toBe(1);
    // issue path is intact
    const zipIssue = r.error.issues.find((i) => i.path.join(".") === "address.zip");
    expect(zipIssue).toBeTruthy();
    // flatten() (existing behaviour) still works alongside format()
    expect(r.error.flatten()["address.zip"]).toBeTruthy();
  }
});

test("format() never pollutes Object.prototype via a malicious key path", () => {
  // Force an issue whose path contains __proto__ using a strict object.
  const schema = v.object({ ok: v.string() }).strict();
  const payload = JSON.parse('{"ok":"x","__proto__":1}');
  const r = schema.safeParse(payload);
  // may or may not flag depending on JSON.parse handling; format must be safe regardless
  if (!r.success) {
    const f = r.error.format();
    expect(f).toBeTruthy();
  }
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
});

test("custom messages are honoured on new checks", () => {
  const r = v.number().multipleOf(2, "even only").safeParse(3);
  expect(r.success).toBe(false);
  if (!r.success) expect(r.error.issues[0]!.message).toBe("even only");
  expect(() => v.string().ip("bad ip").parse("nope")).toThrow(ValidationError);
});
