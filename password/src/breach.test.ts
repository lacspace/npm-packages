import { test, expect, vi } from "vitest";
import { isPwned } from "./breach";
import type { FetchImpl } from "./breach";

// SHA-1("password123") = CBFDAC6008F9CAB4083784CBD1874F76618D2A97
// prefix = CBFDA, suffix = C6008F9CAB4083784CBD1874F76618D2A97
const HIT_SUFFIX = "C6008F9CAB4083784CBD1874F76618D2A97";

function fakeFetch(body: string, ok = true, status = 200): FetchImpl {
  return vi.fn(async (_url: string) => ({ ok, status, text: async () => body }));
}

test("isPwned returns the breach count on a suffix match (never hits network)", async () => {
  const fetchImpl = fakeFetch(`0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${HIT_SUFFIX}:24230\r\nAAAA:5`);
  const count = await isPwned("password123", { fetchImpl });
  expect(count).toBe(24230);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("isPwned sends only the 5-char prefix (k-anonymity)", async () => {
  const fetchImpl = fakeFetch(`${HIT_SUFFIX}:9`);
  await isPwned("password123", { fetchImpl });
  const url = (fetchImpl as any).mock.calls[0][0] as string;
  expect(url.endsWith("/CBFDA")).toBe(true);
  expect(url).not.toContain(HIT_SUFFIX);
});

test("isPwned returns 0 when the suffix is not present", async () => {
  const fetchImpl = fakeFetch(`0018A45C4D1DEF81644B54AB7F969B88D65:1\r\nDEADBEEF:2`);
  expect(await isPwned("password123", { fetchImpl })).toBe(0);
});

test("isPwned matches suffix case-insensitively", async () => {
  const fetchImpl = fakeFetch(`${HIT_SUFFIX.toLowerCase()}:7`);
  expect(await isPwned("password123", { fetchImpl })).toBe(7);
});

test("isPwned returns 0 for empty password without fetching", async () => {
  const fetchImpl = fakeFetch("");
  expect(await isPwned("", { fetchImpl })).toBe(0);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("isPwned throws on a non-ok response", async () => {
  const fetchImpl = fakeFetch("", false, 503);
  await expect(isPwned("password123", { fetchImpl })).rejects.toThrow(/HTTP 503/);
});
