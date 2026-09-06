import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseRdap } from "./rdap.js";

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("./__fixtures__/rdap.example.json", import.meta.url)), "utf8"),
) as unknown;

describe("parseRdap", () => {
  it("parses registrar, dates, nameservers and status from a real RDAP shape", () => {
    const reg = parseRdap(fixture);
    expect(reg.source).toBe("rdap");
    expect(reg.registrar).toBe("RESERVED-Internet Assigned Numbers Authority");
    expect(reg.createdAt).toBe("1995-08-14T04:00:00Z");
    expect(reg.expiresAt).toBe("2026-08-13T04:00:00Z");
    expect(reg.updatedAt).toBe("2024-08-14T07:01:44Z");
    expect(reg.nameServers).toEqual(["a.iana-servers.net", "b.iana-servers.net"]);
    expect(reg.status).toContain("client transfer prohibited");
  });

  it("reports unavailable on an RDAP error object", () => {
    const reg = parseRdap({ errorCode: 404, title: "Not Found" });
    expect(reg.source).toBe("unavailable");
    expect(reg.note).toMatch(/404/);
  });

  it("reports unavailable when there are no usable fields", () => {
    expect(parseRdap({}).source).toBe("unavailable");
    expect(parseRdap(null).source).toBe("unavailable");
  });
});
