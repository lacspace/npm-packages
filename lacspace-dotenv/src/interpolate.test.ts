import { describe, it, expect } from "vitest";
import { resolveEnv, replaceRefs, hasRefs } from "./interpolate.js";
import { lintEnv } from "./lint.js";

describe("resolveEnv", () => {
  it("resolves ${VAR} references, including chains", () => {
    const { resolved, undefinedRefs, circular } = resolveEnv({
      HOST: "localhost",
      PORT: "3000",
      URL: "http://${HOST}:${PORT}",
      PROXY: "${URL}/api",
    });
    expect(resolved.URL).toBe("http://localhost:3000");
    expect(resolved.PROXY).toBe("http://localhost:3000/api");
    expect(undefinedRefs).toEqual([]);
    expect(circular).toEqual([]);
  });

  it("honours ${VAR:-default}, falling back only when unset", () => {
    const { resolved, undefinedRefs } = resolveEnv({
      HOST: "example.com",
      A: "${MISSING:-fallback}",
      B: "${HOST:-nope}",
      C: "${MISSING:-$LITERAL}", // bare $ inside a default is kept literal
    });
    expect(resolved.A).toBe("fallback");
    expect(resolved.B).toBe("example.com");
    expect(resolved.C).toBe("$LITERAL");
    expect(undefinedRefs).toEqual([]);
  });

  it("detects undefined references", () => {
    const { undefinedRefs } = resolveEnv({ URL: "http://${HOST}/x" });
    expect(undefinedRefs).toEqual([{ key: "URL", ref: "HOST" }]);
  });

  it("detects circular references without hanging", () => {
    const { circular, resolved } = resolveEnv({ A: "${B}", B: "${A}" });
    expect(circular.length).toBe(1);
    expect(circular[0]).toContain("A");
    expect(circular[0]).toContain("B");
    // the cycle is broken (resolves to empty), the file still resolves
    expect(resolved.A).toBe("");
  });

  it("leaves bare $VAR and escaped \\${VAR} untouched", () => {
    const { resolved } = resolveEnv({ P: "p$ssw0rd", E: "\\${LITERAL}" });
    expect(resolved.P).toBe("p$ssw0rd");
    expect(resolved.E).toBe("${LITERAL}");
  });
});

describe("replaceRefs / hasRefs", () => {
  it("replaceRefs calls back per braced reference", () => {
    const out = replaceRefs("${A}-${B}", (n) => n.toLowerCase());
    expect(out).toBe("a-b");
  });
  it("hasRefs only sees braced, unescaped references", () => {
    expect(hasRefs("${A}")).toBe(true);
    expect(hasRefs("$A")).toBe(false);
    expect(hasRefs("\\${A}")).toBe(false);
  });
});

describe("lintEnv interpolation rules", () => {
  it("warns on undefined refs and errors on circular refs", () => {
    const rules = lintEnv("A=${MISSING}\nB=${C}\nC=${B}\n").map((i) => `${i.level}:${i.rule}`);
    expect(rules).toContain("warn:undefined-ref");
    expect(rules).toContain("error:circular-ref");
  });
});
