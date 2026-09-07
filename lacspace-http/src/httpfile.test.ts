import { describe, it, expect } from "vitest";
import { parseHttpFile } from "./httpfile.js";

describe("parseHttpFile", () => {
  it("parses a single request with method, headers and body", () => {
    const src = [
      "POST https://api.example.com/users HTTP/1.1",
      "Content-Type: application/json",
      "Accept: application/json",
      "",
      '{ "name": "Ada" }',
    ].join("\n");
    const reqs = parseHttpFile(src);
    expect(reqs).toHaveLength(1);
    const r = reqs[0]!;
    expect(r.method).toBe("POST");
    expect(r.url).toBe("https://api.example.com/users");
    expect(r.headers).toEqual([
      ["Content-Type", "application/json"],
      ["Accept", "application/json"],
    ]);
    expect(r.body).toBe('{ "name": "Ada" }');
  });

  it("defaults the method to GET when omitted", () => {
    const reqs = parseHttpFile("https://example.com/thing");
    expect(reqs[0]!.method).toBe("GET");
    expect(reqs[0]!.url).toBe("https://example.com/thing");
  });

  it("splits multiple requests on ### separators", () => {
    const src = [
      "GET https://a.test/one",
      "###",
      "GET https://a.test/two",
    ].join("\n");
    const reqs = parseHttpFile(src);
    expect(reqs.map((r) => r.url)).toEqual(["https://a.test/one", "https://a.test/two"]);
  });

  it("extracts @name, @capture and @assert directives", () => {
    const src = [
      "# @name login",
      "POST https://a.test/login",
      "Content-Type: application/json",
      "",
      '{"u":"a"}',
      "# @capture token = body.$.access_token",
      "# @assert status == 200",
      "# @assert body.$.ok == true",
    ].join("\n");
    const r = parseHttpFile(src)[0]!;
    expect(r.name).toBe("login");
    expect(r.captures).toEqual([{ name: "token", source: "body.$.access_token" }]);
    expect(r.assertions.map((a) => a.expr)).toEqual([
      "status == 200",
      "body.$.ok == true",
    ]);
  });

  it("keeps {{variables}} verbatim in url, headers and body", () => {
    const src = [
      "GET {{host}}/me",
      "Authorization: Bearer {{token}}",
      "",
      "{{payload}}",
    ].join("\n");
    const r = parseHttpFile(src)[0]!;
    expect(r.url).toBe("{{host}}/me");
    expect(r.headers[0]).toEqual(["Authorization", "Bearer {{token}}"]);
    expect(r.body).toBe("{{payload}}");
  });

  it("supports url continuation lines", () => {
    const src = [
      "GET https://a.test/search",
      "  ?q=cats",
      "  &page=2",
      "Accept: application/json",
    ].join("\n");
    const r = parseHttpFile(src)[0]!;
    expect(r.url).toBe("https://a.test/search?q=cats&page=2");
    expect(r.headers).toEqual([["Accept", "application/json"]]);
  });

  it("ignores plain comments and blank blocks", () => {
    const src = [
      "// just a note",
      "GET https://a.test/x",
      "###",
      "   ",
      "###",
      "# @name y",
      "GET https://a.test/y",
    ].join("\n");
    const reqs = parseHttpFile(src);
    expect(reqs.map((r) => r.url)).toEqual(["https://a.test/x", "https://a.test/y"]);
  });
});
