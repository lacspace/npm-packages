import { describe, it, expect } from "vitest";
import {
  resolveVars, makeScope, parseEnvJson, parseDotenv, parseKvPairs,
} from "./vars.js";

describe("resolveVars", () => {
  it("substitutes known vars and reports missing ones", () => {
    const scope = makeScope({ host: "http://localhost:3000", token: "T" });
    const r = resolveVars("{{host}}/api?t={{token}}&x={{nope}}", scope);
    expect(r.text).toBe("http://localhost:3000/api?t=T&x={{nope}}");
    expect(r.missing).toEqual(["nope"]);
  });

  it("trims whitespace inside the braces", () => {
    const scope = makeScope({ a: "1" });
    expect(resolveVars("{{  a  }}", scope).text).toBe("1");
  });

  it("resolves system variables", () => {
    const scope = makeScope();
    expect(resolveVars("{{$timestamp}}", scope).text).toMatch(/^\d+$/);
    expect(resolveVars("{{$guid}}", scope).text).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    const n = Number(resolveVars("{{$randomInt 5 5}}", scope).text);
    expect(n).toBe(5);
  });

  it("reads process env via $processEnv", () => {
    process.env["LSP_HTTP_TEST"] = "hello";
    expect(resolveVars("{{$processEnv LSP_HTTP_TEST}}", makeScope()).text).toBe("hello");
  });

  it("lets later scope sources win", () => {
    const scope = makeScope({ a: "1" }, { a: "2" });
    expect(scope.get("a")).toBe("2");
  });
});

describe("parseEnvJson", () => {
  const json = JSON.stringify({
    $shared: { base: "shared", host: "shared-host" },
    dev: { host: "http://localhost:3000", token: "dev-token" },
    prod: { host: "https://api.example.com" },
  });

  it("merges $shared then the named env", () => {
    expect(parseEnvJson(json, "dev")).toEqual({
      base: "shared",
      host: "http://localhost:3000",
      token: "dev-token",
    });
  });

  it("stringifies non-string values", () => {
    const j = JSON.stringify({ dev: { port: 8080, flag: true } });
    expect(parseEnvJson(j, "dev")).toEqual({ port: "8080", flag: "true" });
  });

  it("throws for an unknown environment", () => {
    expect(() => parseEnvJson(json, "staging")).toThrow(/not found/i);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseEnvJson("{ not json", "dev")).toThrow(/Invalid env JSON/);
  });
});

describe("parseDotenv", () => {
  it("parses KEY=VALUE lines, ignoring comments and quotes", () => {
    const env = parseDotenv([
      "# a comment",
      "HOST=http://localhost:3000",
      'TOKEN="quoted value"',
      "export API_KEY='abc'",
      "",
      "NO_EQUALS",
    ].join("\n"));
    expect(env).toEqual({
      HOST: "http://localhost:3000",
      TOKEN: "quoted value",
      API_KEY: "abc",
    });
  });
});

describe("parseKvPairs", () => {
  it("builds an object from k=v pairs", () => {
    expect(parseKvPairs(["a=1", "b=hello world", "c="])).toEqual({
      a: "1", b: "hello world", c: "",
    });
  });
});
