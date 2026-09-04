import { test, expect } from "vitest";
import {
  createEnv,
  EnvError,
  str,
  num,
  int,
  port,
  bool,
  url,
  email,
  oneOf,
  json,
} from "./index";

test("valid schema returns typed, frozen values", () => {
  const env = createEnv(
    {
      NODE_ENV: oneOf(["development", "production", "test"], { default: "development" }),
      PORT: port({ default: 3000 }),
      DATABASE_URL: url(),
      DEBUG: bool({ default: false }),
      COUNT: int(),
    },
    { DATABASE_URL: "https://db.example.com", COUNT: "7" },
  );
  expect(env.NODE_ENV).toBe("development");
  expect(env.PORT).toBe(3000);
  expect(env.DATABASE_URL).toBe("https://db.example.com");
  expect(env.DEBUG).toBe(false);
  expect(env.COUNT).toBe(7);
  expect(Object.isFrozen(env)).toBe(true);
});

test("missing required vars aggregate into one EnvError", () => {
  let caught: unknown;
  try {
    createEnv({ A: str(), B: num(), C: url() }, {});
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(EnvError);
  expect((caught as EnvError).issues.length).toBe(3);
  expect((caught as EnvError).message).toContain("Invalid environment variables");
});

test("num accepts valid and rejects invalid", () => {
  expect(num().parse("3.14", "X")).toBeCloseTo(3.14);
  expect(num({ min: 0, max: 10 }).parse("5", "X")).toBe(5);
  expect(() => num().parse("abc", "X")).toThrow();
  expect(() => num({ min: 10 }).parse("5", "X")).toThrow();
});

test("int accepts integers and rejects floats", () => {
  expect(int().parse("42", "X")).toBe(42);
  expect(() => int().parse("3.14", "X")).toThrow();
});

test("port validates the 1..65535 range", () => {
  expect(port().parse("8080", "X")).toBe(8080);
  expect(() => port().parse("0", "X")).toThrow();
  expect(() => port().parse("70000", "X")).toThrow();
});

test("bool accepts many truthy/falsey forms and rejects junk", () => {
  expect(bool().parse("yes", "X")).toBe(true);
  expect(bool().parse("1", "X")).toBe(true);
  expect(bool().parse("ON", "X")).toBe(true);
  expect(bool().parse("off", "X")).toBe(false);
  expect(bool().parse("0", "X")).toBe(false);
  expect(() => bool().parse("maybe", "X")).toThrow();
});

test("url accepts valid and rejects invalid", () => {
  expect(url().parse("https://a.com/path", "X")).toBe("https://a.com/path");
  expect(() => url().parse("not a url", "X")).toThrow();
});

test("email accepts plausible and rejects invalid", () => {
  expect(email().parse("a@b.com", "X")).toBe("a@b.com");
  expect(() => email().parse("nope", "X")).toThrow();
});

test("oneOf accepts members and rejects strangers", () => {
  expect(oneOf(["a", "b"]).parse("b", "X")).toBe("b");
  expect(() => oneOf(["a", "b"]).parse("c", "X")).toThrow();
});

test("json parses valid and rejects malformed", () => {
  expect(json().parse('{"a":1}', "X")).toEqual({ a: 1 });
  expect(() => json().parse("{bad", "X")).toThrow();
});

test("str({allowEmpty}) distinguishes empty string from unset", () => {
  const withEmpty = createEnv({ X: str({ allowEmpty: true }) }, { X: "" });
  expect(withEmpty.X).toBe("");
  // Without allowEmpty, "" is treated as missing → required error.
  expect(() => createEnv({ X: str() }, { X: "" })).toThrow(EnvError);
});
