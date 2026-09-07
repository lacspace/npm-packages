import { describe, it, expect } from "vitest";
import { detectFormat, matchesFormat } from "./formats.js";
import { inferNode } from "./infer.js";
import { schemaToExample } from "./example.js";
import type { JSONSchema } from "./types.js";

describe("richer format detection (0.2.0)", () => {
  it("detects time", () => {
    expect(inferNode(["12:30:00", "23:59:59"]).format).toBe("time");
    expect(detectFormat(["00:00:00"])).toBe("time");
  });
  it("detects ipv6", () => {
    expect(detectFormat(["::1", "2001:db8::ff00:42:8329"])).toBe("ipv6");
  });
  it("still detects the original formats", () => {
    expect(detectFormat(["a@x.com"])).toBe("email");
    expect(detectFormat(["2020-01-01"])).toBe("date");
    expect(detectFormat(["127.0.0.1"])).toBe("ipv4");
  });
  it("does not label plain strings", () => {
    expect(detectFormat(["hello world"])).toBeUndefined();
  });
});

describe("matchesFormat", () => {
  it("validates by format name", () => {
    expect(matchesFormat("email", "a@x.com")).toBe(true);
    expect(matchesFormat("email", "nope")).toBe(false);
    expect(matchesFormat("uuid", "123e4567-e89b-12d3-a456-426614174000")).toBe(true);
  });
  it("passes unknown formats through", () => {
    expect(matchesFormat("byte", "anything")).toBe(true);
  });
});

describe("richer inference — integer vs number & nullability", () => {
  it("keeps integers distinct from floats", () => {
    expect(inferNode([1, 2, 3]).type).toBe("integer");
    expect(inferNode([1.5]).type).toBe("number");
  });
  it("marks a field nullable from null samples", () => {
    expect(inferNode(["a", null]).type).toEqual(["string", "null"]);
  });
});

describe("richer example output (0.2.0)", () => {
  it("respects an enum's first value and a declared format", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: {
        role: { type: "string", enum: ["admin", "user"] },
        created: { type: "string", format: "date-time" },
        ip: { type: "string", format: "ipv6" },
      },
      required: ["role", "created", "ip"],
    };
    const ex = schemaToExample(schema) as Record<string, string>;
    expect(ex.role).toBe("admin");
    expect(ex.created).toBe("2020-01-01T00:00:00Z");
    expect(ex.ip).toBe("::1");
  });
  it("truncates strings to maxLength", () => {
    expect((schemaToExample({ type: "string", maxLength: 3 }) as string).length).toBeLessThanOrEqual(3);
  });
  it("derives a hint from a title", () => {
    expect(schemaToExample({ type: "string", title: "Country" })).toBe("country");
  });
});
