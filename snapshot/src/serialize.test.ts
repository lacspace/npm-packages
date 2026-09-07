import { describe, it, expect, afterEach } from "vitest";
import { serialize, addSerializer, getSerializers, resetSerializers } from "./index";

afterEach(() => resetSerializers());

describe("serialize — primitives", () => {
  it("renders strings quoted with escapes", () => {
    expect(serialize("hi")).toBe('"hi"');
    expect(serialize('a"b\n')).toBe('"a\\"b\\n"');
  });
  it("renders numbers, NaN, Infinity and -0 distinctly", () => {
    expect(serialize(42)).toBe("42");
    expect(serialize(NaN)).toBe("NaN");
    expect(serialize(Infinity)).toBe("Infinity");
    expect(serialize(-Infinity)).toBe("-Infinity");
    expect(serialize(-0)).toBe("-0");
    expect(serialize(0)).toBe("0");
  });
  it("renders bigint with an n suffix", () => {
    expect(serialize(10n)).toBe("10n");
    expect(serialize(-5n)).toBe("-5n");
  });
  it("renders booleans, null and undefined", () => {
    expect(serialize(true)).toBe("true");
    expect(serialize(false)).toBe("false");
    expect(serialize(null)).toBe("null");
    expect(serialize(undefined)).toBe("undefined");
  });
  it("renders symbols with their description", () => {
    expect(serialize(Symbol("s"))).toBe("Symbol(s)");
    expect(serialize(Symbol())).toBe("Symbol()");
  });
});

describe("serialize — functions", () => {
  it("prints function names by default", () => {
    function foo() {}
    expect(serialize(foo)).toBe("[Function foo]");
  });
  it("prints anonymous for nameless functions", () => {
    expect(serialize((() => () => {})())).toBe("[Function anonymous]");
  });
  it("hides names when printFunctionNames is false", () => {
    function bar() {}
    expect(serialize(bar, { printFunctionNames: false })).toBe("[Function]");
  });
});

describe("serialize — determinism", () => {
  it("sorts object keys regardless of insertion order", () => {
    const a = serialize({ b: 1, a: 2, c: 3 });
    const b = serialize({ c: 3, a: 2, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('Object {\n  "a": 2,\n  "b": 1,\n  "c": 3,\n}');
  });
  it("sorts Set entries regardless of insertion order", () => {
    expect(serialize(new Set([3, 1, 2]))).toBe(serialize(new Set([1, 2, 3])));
  });
  it("sorts Map entries regardless of insertion order", () => {
    const m1 = new Map([["b", 1], ["a", 2]]);
    const m2 = new Map([["a", 2], ["b", 1]]);
    expect(serialize(m1)).toBe(serialize(m2));
  });
});

describe("serialize — containers", () => {
  it("renders empty containers compactly", () => {
    expect(serialize({})).toBe("Object {}");
    expect(serialize([])).toBe("Array []");
    expect(serialize(new Map())).toBe("Map {}");
    expect(serialize(new Set())).toBe("Set {}");
  });
  it("renders arrays with trailing commas", () => {
    expect(serialize([1, 2])).toBe("Array [\n  1,\n  2,\n]");
  });
  it("renders nested objects with indentation", () => {
    expect(serialize({ a: { b: 1 } })).toBe(
      'Object {\n  "a": Object {\n    "b": 1,\n  },\n}',
    );
  });
  it("respects a custom indent width", () => {
    expect(serialize({ a: 1 }, { indent: 4 })).toBe('Object {\n    "a": 1,\n}');
  });
  it("renders Map entries with => arrows", () => {
    expect(serialize(new Map([["k", "v"]]))).toBe('Map {\n  "k" => "v",\n}');
  });
});

describe("serialize — built-in objects", () => {
  it("renders Date as an ISO string", () => {
    expect(serialize(new Date("2020-01-02T03:04:05.000Z"))).toBe("2020-01-02T03:04:05.000Z");
  });
  it("renders invalid Date safely", () => {
    expect(serialize(new Date("nope"))).toBe("Date { Invalid Date }");
  });
  it("renders RegExp with flags", () => {
    expect(serialize(/ab+c/gi)).toBe("/ab+c/gi");
  });
  it("renders Errors with name and message", () => {
    expect(serialize(new TypeError("boom"))).toBe("[TypeError: boom]");
    expect(serialize(new Error(""))).toBe("[Error]");
  });
  it("renders typed arrays with their constructor name", () => {
    expect(serialize(new Int8Array([1, 2, 3]))).toBe("Int8Array [\n  1,\n  2,\n  3,\n]");
    expect(serialize(new Uint8Array([]))).toBe("Uint8Array []");
  });
  it("renders BigInt typed arrays element-wise", () => {
    expect(serialize(new BigInt64Array([1n, 2n]))).toBe("BigInt64Array [\n  1n,\n  2n,\n]");
  });
});

describe("serialize — class instances", () => {
  class Point {
    constructor(public x: number, public y: number) {}
  }
  it("labels instances with the constructor name and sorts fields", () => {
    expect(serialize(new Point(1, 2))).toBe('Point {\n  "x": 1,\n  "y": 2,\n}');
  });
  it("labels null-prototype objects as Object", () => {
    const o = Object.create(null) as Record<string, unknown>;
    o.z = 1;
    expect(serialize(o)).toBe('Object {\n  "z": 1,\n}');
  });
  it("includes enumerable symbol keys", () => {
    const s = Symbol("tag");
    const out = serialize({ [s]: 1, a: 2 });
    expect(out).toContain('"a": 2');
    expect(out).toContain("Symbol(tag): 1");
  });
});

describe("serialize — circular references", () => {
  it("marks self-references as [Circular]", () => {
    const o: Record<string, unknown> = { a: 1 };
    o.self = o;
    expect(serialize(o)).toBe('Object {\n  "a": 1,\n  "self": [Circular],\n}');
  });
  it("marks circular arrays", () => {
    const arr: unknown[] = [1];
    arr.push(arr);
    expect(serialize(arr)).toBe("Array [\n  1,\n  [Circular],\n]");
  });
  it("does not treat sibling repeats as circular", () => {
    const shared = { x: 1 };
    const out = serialize({ a: shared, b: shared });
    expect(out).not.toContain("[Circular]");
  });
});

describe("serialize — maxDepth", () => {
  it("collapses beyond the configured depth", () => {
    const deep = { a: { b: { c: { d: 1 } } } };
    const out = serialize(deep, { maxDepth: 1 });
    expect(out).toBe('Object {\n  "a": Object {\n    "b": [Object],\n  },\n}');
  });
  it("collapses arrays and typed arrays too", () => {
    expect(serialize({ a: [1] }, { maxDepth: 0 })).toBe('Object {\n  "a": [Array],\n}');
  });
});

describe("serialize — custom serializers", () => {
  it("applies a per-call serializer", () => {
    const out = serialize(
      { id: 7 },
      {
        serializers: [
          {
            test: (v) => typeof v === "object" && v !== null && "id" in (v as object),
            serialize: (v) => `Entity#${(v as { id: number }).id}`,
          },
        ],
      },
    );
    expect(out).toBe("Entity#7");
  });
  it("lets a serializer recurse via ctx.print", () => {
    const out = serialize(
      { wrap: { a: 1 } },
      {
        serializers: [
          {
            test: (v) => typeof v === "object" && v !== null && "wrap" in (v as object),
            serialize: (v, ctx) => `Wrapped(${ctx.print((v as { wrap: unknown }).wrap)})`,
          },
        ],
      },
    );
    expect(out).toBe('Wrapped(Object {\n    "a": 1,\n  })');
  });
  it("registers and removes a global serializer", () => {
    const remove = addSerializer({
      test: (v) => v === 123,
      serialize: () => "ONE-TWO-THREE",
    });
    expect(getSerializers().length).toBe(1);
    expect(serialize(123)).toBe("ONE-TWO-THREE");
    remove();
    expect(getSerializers().length).toBe(0);
    expect(serialize(123)).toBe("123");
  });
  it("rejects malformed plugins", () => {
    // @ts-expect-error intentionally invalid
    expect(() => addSerializer({})).toThrow(TypeError);
  });
  it("ignores a serializer whose test throws", () => {
    addSerializer({
      test: () => {
        throw new Error("nope");
      },
      serialize: () => "SHOULD-NOT-HAPPEN",
    });
    expect(serialize(1)).toBe("1");
  });
});

describe("serialize — is idempotent / stable", () => {
  it("produces identical output across repeated calls", () => {
    const value = { list: [1, 2, { m: new Map([["a", 1]]), s: new Set([2, 1]) }], d: new Date(0) };
    expect(serialize(value)).toBe(serialize(value));
  });
});
