import { describe, it, expect, vi } from "vitest";
import { parseSemver, diffLevel, fetchLatest, checkOutdated } from "./outdated.js";
import type { FetchLike } from "./outdated.js";
import type { InstalledPackage } from "./inventory.js";

const p = (name: string, version: string, depth = 0): InstalledPackage => ({
  name, version, path: `node_modules/${name}`, dir: `/x/${name}`, depth,
  direct: depth === 0, dev: false, license: "MIT", dependencies: [],
});

/** Build a mock fetch that maps package name → latest version (or 404). */
function mockFetch(latest: Record<string, string | null>): FetchLike {
  return vi.fn(async (url: string) => {
    const name = decodeURIComponent(url.split("/").pop()!);
    const v = latest[name];
    if (v == null) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ "dist-tags": { latest: v } }) };
  }) as unknown as FetchLike;
}

describe("parseSemver", () => {
  it("parses and strips range prefixes / pre-release", () => {
    expect(parseSemver("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseSemver("^2.0.1")).toEqual({ major: 2, minor: 0, patch: 1 });
    expect(parseSemver("3.4.5-beta.1")).toEqual({ major: 3, minor: 4, patch: 5 });
    expect(parseSemver("not-a-version")).toBeNull();
  });
});

describe("diffLevel", () => {
  it("classifies major/minor/patch/up-to-date", () => {
    expect(diffLevel("1.0.0", "2.0.0")).toBe("major");
    expect(diffLevel("1.2.0", "1.3.0")).toBe("minor");
    expect(diffLevel("1.2.3", "1.2.9")).toBe("patch");
    expect(diffLevel("1.2.3", "1.2.3")).toBe("up-to-date");
    expect(diffLevel("2.0.0", "1.0.0")).toBe("up-to-date");
  });
});

describe("fetchLatest (mocked)", () => {
  it("reads dist-tags.latest and never hits the network in tests", async () => {
    const fetchImpl = mockFetch({ lodash: "4.17.21" });
    expect(await fetchLatest("lodash", { fetchImpl })).toBe("4.17.21");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it("returns null on a 404 / error without throwing", async () => {
    expect(await fetchLatest("ghost", { fetchImpl: mockFetch({}) })).toBeNull();
  });
});

describe("checkOutdated (mocked)", () => {
  it("reports majors/behind for direct deps using the mock registry", async () => {
    const installed = [
      p("current", "2.0.0"),
      p("behindMajor", "1.0.0"),
      p("behindMinor", "1.1.0"),
      p("transitive", "1.0.0", 1), // not direct → skipped by default
    ];
    const fetchImpl = mockFetch({
      current: "2.0.0",
      behindMajor: "3.0.0",
      behindMinor: "1.4.0",
      transitive: "9.0.0",
    });
    const report = await checkOutdated(installed, { fetchImpl });
    expect(report.entries.map((e) => e.name).sort()).toEqual(["behindMajor", "behindMinor", "current"]);
    expect(report.majors).toBe(1);
    expect(report.behind).toBe(2);
    const major = report.entries.find((e) => e.name === "behindMajor")!;
    expect(major.level).toBe("major");
    expect(major.latest).toBe("3.0.0");
  });

  it("marks a package with no registry data as unknown", async () => {
    const report = await checkOutdated([p("gone", "1.0.0")], { fetchImpl: mockFetch({}) });
    expect(report.entries[0]!.level).toBe("unknown");
    expect(report.entries[0]!.error).toBeTruthy();
  });
});
