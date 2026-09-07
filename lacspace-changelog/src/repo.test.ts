import { describe, it, expect } from "vitest";
import { parseRepository, urlTemplates } from "./repo.js";

describe("parseRepository", () => {
  it("handles git+https with .git", () => {
    const r = parseRepository("git+https://github.com/lacspace/npm-packages.git")!;
    expect(r.host).toBe("github");
    expect(r.baseUrl).toBe("https://github.com/lacspace/npm-packages");
    expect(r.owner).toBe("lacspace");
    expect(r.name).toBe("npm-packages");
  });
  it("handles scp syntax", () => {
    const r = parseRepository("git@gitlab.com:group/proj.git")!;
    expect(r.host).toBe("gitlab");
    expect(r.baseUrl).toBe("https://gitlab.com/group/proj");
  });
  it("handles owner/repo shorthand as github", () => {
    const r = parseRepository("owner/repo")!;
    expect(r.host).toBe("github");
    expect(r.baseUrl).toBe("https://github.com/owner/repo");
  });
  it("detects bitbucket", () => {
    expect(parseRepository("https://bitbucket.org/o/r")!.host).toBe("bitbucket");
  });
  it("marks unknown hosts", () => {
    expect(parseRepository("https://example.com/o/r")!.host).toBe("unknown");
  });
  it("returns null for empty/garbage", () => {
    expect(parseRepository("")).toBeNull();
    expect(parseRepository(undefined)).toBeNull();
    expect(parseRepository("not a url")).toBeNull();
  });
});

describe("urlTemplates", () => {
  it("github commit/issue/compare", () => {
    const t = urlTemplates(parseRepository("https://github.com/o/r"));
    expect(t.commit("abc")).toBe("https://github.com/o/r/commit/abc");
    expect(t.issue("9")).toBe("https://github.com/o/r/issues/9");
    expect(t.compare("v1", "v2")).toBe("https://github.com/o/r/compare/v1...v2");
  });
  it("gitlab uses /-/ paths", () => {
    const t = urlTemplates(parseRepository("https://gitlab.com/o/r"));
    expect(t.commit("abc")).toBe("https://gitlab.com/o/r/-/commit/abc");
    expect(t.compare("v1", "v2")).toBe("https://gitlab.com/o/r/-/compare/v1...v2");
  });
  it("empty templates without a repo", () => {
    const t = urlTemplates(null);
    expect(t.commit("abc")).toBe("");
    expect(t.baseUrl).toBe("");
  });
});
