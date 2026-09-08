import { describe, it, expect } from "vitest";
import { generateProject, listFeatures, getFeature } from "./lib.js";
import { buildFiles, resolveContext, FEATURES } from "./index.js";

describe("feature registry", () => {
  it("listFeatures() returns copies of every feature (ai-chat + rag)", () => {
    const feats = listFeatures();
    const keys = feats.map((f) => f.key).sort();
    expect(keys).toEqual(["ai-chat", "analytics", "auth-pages", "content", "email", "payments", "rag", "search"]);
    // Copies — mutating the result must not touch the registry.
    feats[0]!.label = "MUTATED";
    expect(FEATURES.find((f) => f.key === feats[0]!.key)!.label).not.toBe("MUTATED");
  });

  it("getFeature() looks up by key, undefined for unknown", () => {
    expect(getFeature("ai-chat")?.label).toBe("AI chat");
    expect(getFeature("rag")?.key).toBe("rag");
    expect(getFeature("does-not-exist")).toBeUndefined();
  });

  it("every feature declares files, nextSteps, and adds deps (frontend or backend)", () => {
    for (const f of listFeatures()) {
      expect(typeof f.files).toBe("function");
      expect(f.nextSteps.length).toBeGreaterThan(0);
      // A feature must contribute something: frontend deps, or a backend hook
      // (backend-only add-ons like auth-pages carry their deps in backend()).
      expect(Object.keys(f.deps).length > 0 || typeof f.backend === "function").toBe(true);
    }
  });
});

describe("backward compatibility (strictly additive)", () => {
  it("no features === today: no ai/rag files, no LEARN.md, base deps only", () => {
    const base = generateProject({ template: "saas" });
    expect("app/api/chat/route.ts" in base).toBe(false);
    expect("app/chat/page.tsx" in base).toBe(false);
    expect("app/api/ask/route.ts" in base).toBe(false);
    expect("content/welcome.md" in base).toBe(false);
    expect("LEARN.md" in base).toBe(false);
    expect(base["package.json"]).not.toContain("@lacspace/ai");
    expect(base["package.json"]).not.toContain("@lacspace/rag");
  });

  it("features:[] is byte-for-byte identical to omitting features", () => {
    for (const t of ["personal", "saas", "blog", "dashboard", "marketplace"]) {
      const a = JSON.stringify(generateProject({ template: t }));
      const b = JSON.stringify(generateProject({ template: t, features: [] }));
      expect(a).toBe(b);
    }
  });

  it("base .env.example is unchanged when no features are selected", () => {
    const base = generateProject({ template: "personal" });
    expect(base[".env.example"]).toBe("# Your production URL — powers canonical URLs, sitemap, robots and OG images.\nNEXT_PUBLIC_SITE_URL=https://example.com\n");
  });
});

describe("feature: ai-chat", () => {
  const files = generateProject({ template: "saas", features: ["ai-chat"] });

  it("adds the chat route + UI files", () => {
    expect("app/api/chat/route.ts" in files).toBe(true);
    expect("app/chat/page.tsx" in files).toBe(true);
    expect(files["app/api/chat/route.ts"]).toContain("resolveConfig");
    expect(files["app/api/chat/route.ts"]).toContain("@lacspace/stream");
    expect(files["app/api/chat/route.ts"]).toContain("detectPromptInjection");
    expect(files["app/chat/page.tsx"]).toContain("/api/chat");
  });

  it("merges the ai-chat deps into package.json", () => {
    const pkg = JSON.parse(files["package.json"]!) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["@lacspace/ai"]).toBe("^1.1.0");
    expect(pkg.dependencies["@lacspace/prompt"]).toBe("^1.1.0");
    expect(pkg.dependencies["@lacspace/stream"]).toBe("^1.1.0");
    expect(pkg.dependencies["@lacspace/providers"]).toBe("^1.0.0");
    expect(pkg.dependencies["@lacspace/memory"]).toBe("^1.0.0");
    expect(pkg.dependencies["@lacspace/moderation"]).toBe("^1.0.0");
    // base deps still present
    expect(pkg.dependencies["next"]).toBe("^15.1.0");
  });

  it("appends the LACSPACE_AI_* env to .env.example", () => {
    expect(files[".env.example"]).toContain("LACSPACE_AI_PROVIDER=");
    expect(files[".env.example"]).toContain("LACSPACE_AI_BASE_URL=");
    expect(files[".env.example"]).toContain("LACSPACE_AI_MODEL=");
    expect(files[".env.example"]).toContain("LACSPACE_AI_API_KEY=");
    // base env preserved
    expect(files[".env.example"]).toContain("NEXT_PUBLIC_SITE_URL=");
  });

  it("generates a LEARN.md that mentions the free/local next-steps", () => {
    expect("LEARN.md" in files).toBe(true);
    expect(files["LEARN.md"]).toContain("ai-chat");
    expect(files["LEARN.md"]).toContain("Ollama");
  });
});

describe("feature: rag", () => {
  const files = generateProject({ template: "docs", features: ["rag"] });

  it("adds content, index script, ask route + UI", () => {
    expect("content/welcome.md" in files).toBe(true);
    expect("scripts/index-content.mjs" in files).toBe(true);
    expect("app/api/ask/route.ts" in files).toBe(true);
    expect("app/ask/page.tsx" in files).toBe(true);
    expect(files["scripts/index-content.mjs"]).toContain("@lacspace/chunk");
    expect(files["scripts/index-content.mjs"]).toContain(".rag-index.json");
    expect(files["app/api/ask/route.ts"]).toContain(".rag-index.json");
    expect(files["app/api/ask/route.ts"]).toContain("rerank");
  });

  it("adds the rag:index script + rag deps + embed env", () => {
    const pkg = JSON.parse(files["package.json"]!) as { dependencies: Record<string, string>; scripts: Record<string, string> };
    expect(pkg.scripts["rag:index"]).toBe("node scripts/index-content.mjs");
    expect(pkg.dependencies["@lacspace/rag"]).toBe("^1.0.0");
    expect(pkg.dependencies["@lacspace/embeddings"]).toBe("^1.0.0");
    expect(pkg.dependencies["@lacspace/vector"]).toBe("^1.0.0");
    expect(pkg.dependencies["@lacspace/rerank"]).toBe("^1.0.0");
    expect(pkg.dependencies["@lacspace/chunk"]).toBe("^1.1.0");
    expect(files[".env.example"]).toContain("LACSPACE_EMBED_MODEL=");
  });
});

describe("composition + normalization", () => {
  it("both features compose without file collision", () => {
    const files = generateProject({ template: "business", features: ["ai-chat", "rag"] });
    for (const f of ["app/api/chat/route.ts", "app/chat/page.tsx", "app/api/ask/route.ts", "app/ask/page.tsx", "content/welcome.md", "scripts/index-content.mjs"]) {
      expect(f in files).toBe(true);
    }
    const pkg = JSON.parse(files["package.json"]!) as { dependencies: Record<string, string> };
    // shared dep present exactly once, both feature sets merged
    expect(pkg.dependencies["@lacspace/ai"]).toBe("^1.1.0");
    expect(pkg.dependencies["@lacspace/rag"]).toBe("^1.0.0");
    // shared LACSPACE_AI_* env deduped (documented once, not twice)
    const occurrences = files[".env.example"]!.split("LACSPACE_AI_PROVIDER=").length - 1;
    expect(occurrences).toBe(1);
  });

  it("feature selection is order-independent (same file set)", () => {
    const a = generateProject({ template: "blog", features: ["ai-chat", "rag"] });
    const b = generateProject({ template: "blog", features: ["rag", "ai-chat"] });
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
  });

  it("unknown feature keys are ignored safely; duplicates de-duped", () => {
    const ctx = resolveContext({ template: "saas", features: ["ai-chat", "nope", "ai-chat"] });
    expect(ctx.features.map((f) => f.key)).toEqual(["ai-chat"]);
    // buildFiles still works and does not emit rag files
    const files = buildFiles(ctx);
    expect("app/chat/page.tsx" in files).toBe(true);
    expect("app/ask/page.tsx" in files).toBe(false);
  });

  it("generating with only an unknown feature === base scaffold", () => {
    const withUnknown = generateProject({ template: "personal", features: ["totally-unknown"] });
    const base = generateProject({ template: "personal" });
    expect(JSON.stringify(withUnknown)).toBe(JSON.stringify(base));
  });
});

describe("feature: content", () => {
  const files = generateProject({ template: "business", features: ["content"] });
  it("adds a markdown content section + RSS + llms.txt", () => {
    for (const f of [
      "content/updates/welcome.md",
      "lib/content.ts",
      "app/updates/page.tsx",
      "app/updates/[slug]/page.tsx",
      "app/feed.xml/route.ts",
      "app/llms.txt/route.ts",
    ]) expect(f in files, f).toBe(true);
    expect(files["app/feed.xml/route.ts"]).toContain("@lacspace/rss");
    expect(files["app/llms.txt/route.ts"]).toContain("@lacspace/llms-txt");
  });
  it("does not collide with the blog template's own content/posts", () => {
    const blog = generateProject({ template: "blog", features: ["content"] });
    // Blog template owns content/posts/*; the add-on owns content/updates/*.
    expect("content/posts/welcome.md" in blog).toBe(true);
    expect("content/updates/welcome.md" in blog).toBe(true);
    expect("lib/posts.ts" in blog).toBe(true);
    expect("lib/content.ts" in blog).toBe(true);
  });
});

describe("feature: search", () => {
  const files = generateProject({ template: "saas", features: ["search"] });
  it("adds a keyless BM25 search route + box + page", () => {
    expect("app/api/search/route.ts" in files).toBe(true);
    expect("components/search.tsx" in files).toBe(true);
    expect("app/search/page.tsx" in files).toBe(true);
    expect(files["app/api/search/route.ts"]).toContain("@lacspace/rerank");
    // BM25 (no embeddings / no Ollama needed).
    expect(files["app/api/search/route.ts"]).toContain('method: "bm25"');
  });
  it("content + search compose (search indexes the content dir)", () => {
    const combo = generateProject({ template: "personal", features: ["content", "search"] });
    expect("content/updates/welcome.md" in combo).toBe(true);
    expect("app/api/search/route.ts" in combo).toBe(true);
  });
});
