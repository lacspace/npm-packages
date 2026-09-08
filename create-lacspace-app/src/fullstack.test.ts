import { describe, it, expect } from "vitest";
import { generateProject, listRecipes, getRecipe } from "./lib.js";
import { resolveContext, TEMPLATES } from "./index.js";

const ALL = TEMPLATES.map((t) => t.key);

describe("mode: backward compatibility", () => {
  it('resolveContext defaults mode to "static"', () => {
    expect(resolveContext({}).mode).toBe("static");
    expect(resolveContext({ template: "saas" }).mode).toBe("static");
    // Anything that isn't exactly "dynamic" is treated as static.
    expect(resolveContext({ mode: "dynamic" }).mode).toBe("dynamic");
    expect(resolveContext({ mode: "nope" as never }).mode).toBe("static");
  });

  it("omitting mode is byte-for-byte identical to mode:'static' for every template", () => {
    for (const t of ALL) {
      const a = JSON.stringify(generateProject({ template: t }));
      const b = JSON.stringify(generateProject({ template: t, mode: "static" }));
      expect(a, `template ${t}`).toBe(b);
    }
  });

  it("static output has no monorepo files (no frontend/ backend/ types/ prefixes)", () => {
    const files = generateProject({ template: "saas", mode: "static" });
    const keys = Object.keys(files);
    expect(keys.some((k) => k.startsWith("frontend/") || k.startsWith("backend/") || k.startsWith("types/"))).toBe(false);
    expect(keys).toContain("app/page.tsx");
  });
});

describe("mode: dynamic (full-stack monorepo)", () => {
  const files = generateProject({ name: "acme-shop", template: "saas", mode: "dynamic" });
  const keys = Object.keys(files);

  it("moves the Next.js app under frontend/ (template still applied)", () => {
    expect(keys).toContain("frontend/app/page.tsx");
    expect(keys).toContain("frontend/app/layout.tsx");
    expect(keys).toContain("frontend/lib/site.ts");
    // The root, not the app, owns the top-level package.json.
    expect(files["frontend/app/page.tsx"]).toBeTruthy();
  });

  it("adds the backend workspace (Express + @lacspace, ESM)", () => {
    for (const f of [
      "backend/package.json",
      "backend/tsconfig.json",
      "backend/src/index.ts",
      "backend/src/app.ts",
      "backend/src/env.ts",
      "backend/src/cache.ts",
      "backend/src/db.ts",
      "backend/src/http.ts",
      "backend/src/express.d.ts",
      "backend/src/validation.ts",
      "backend/src/middleware/auth.ts",
      "backend/src/middleware/error.ts",
      "backend/src/models/user.ts",
      "backend/src/models/note.ts",
      "backend/src/routes/auth.ts",
      "backend/src/routes/notes.ts",
    ]) {
      expect(keys, f).toContain(f);
    }
    const bp = JSON.parse(files["backend/package.json"]!);
    expect(bp.name).toBe("@acme-shop/backend");
    expect(bp.type).toBe("module");
    expect(bp.dependencies["express"]).toBeTruthy();
    expect(bp.dependencies["@lacspace/jwt"]).toBeTruthy();
    expect(bp.dependencies["@lacspace/password"]).toBeTruthy();
    expect(bp.dependencies["@acme-shop/types"]).toBe("*");
  });

  it("adds the shared types workspace as a type-only .d.ts", () => {
    expect(keys).toContain("types/package.json");
    expect(keys).toContain("types/index.d.ts");
    expect(keys).not.toContain("types/src/index.ts");
    const dts = files["types/index.d.ts"]!;
    expect(dts).toContain("export interface User");
    expect(dts).toContain("export interface Note");
    // Type-only: no runtime declarations.
    const noComments = dts.replace(/\/\/.*$/gm, "");
    expect(/\b(const|let|var|function|class)\b/.test(noComments)).toBe(false);
    const tp = JSON.parse(files["types/package.json"]!);
    expect(tp.name).toBe("@acme-shop/types");
    expect(tp.types).toBe("./index.d.ts");
  });

  it("wires the frontend to the API (client + auth/account pages)", () => {
    expect(keys).toContain("frontend/lib/api.ts");
    expect(keys).toContain("frontend/app/login/page.tsx");
    expect(keys).toContain("frontend/app/register/page.tsx");
    expect(keys).toContain("frontend/app/account/page.tsx");
    const fp = JSON.parse(files["frontend/package.json"]!);
    expect(fp.name).toBe("@acme-shop/frontend");
    expect(fp.dependencies["@acme-shop/types"]).toBe("*");
    // tsconfig resolves the shared types via a path mapping.
    const ft = JSON.parse(files["frontend/tsconfig.json"]!);
    expect(ft.compilerOptions.paths["@acme-shop/types"]).toEqual(["../types/index.d.ts"]);
  });

  it("sets up the root workspace + Docker (one install, one dev command)", () => {
    expect(keys).toContain("package.json");
    expect(keys).toContain("docker-compose.yml");
    expect(keys).toContain(".env.example");
    expect(keys).toContain("README.md");
    const root = JSON.parse(files["package.json"]!);
    expect(root.name).toBe("acme-shop");
    expect(root.workspaces).toEqual(["types", "backend", "frontend"]);
    expect(root.scripts.dev).toContain("concurrently");
    expect(root.devDependencies.concurrently).toBeTruthy();
    expect(files["docker-compose.yml"]).toContain("mongo");
    expect(files["docker-compose.yml"]).toContain("redis");
    expect(files[".env.example"]).toContain("MONGODB_URI");
    expect(files[".env.example"]).toContain("JWT_SECRET");
  });

  it("every generated JSON file parses", () => {
    for (const k of keys) {
      if (k.endsWith(".json")) expect(() => JSON.parse(files[k]!), k).not.toThrow();
    }
  });

  it("composes with feature add-ons (they layer onto the frontend)", () => {
    const withAi = generateProject({ name: "acme", template: "saas", mode: "dynamic", features: ["ai-chat"] });
    expect(Object.keys(withAi)).toContain("frontend/app/api/chat/route.ts");
    // The backend is still present alongside the feature.
    expect(Object.keys(withAi)).toContain("backend/src/app.ts");
  });
});

describe("backend-aware add-ons (require the full-stack backend)", () => {
  it("a requiresBackend add-on auto-upgrades a static request to dynamic", () => {
    const f = generateProject({ name: "acme", template: "saas", features: ["auth-pages"] });
    // No mode passed, yet a monorepo was produced.
    expect(Object.keys(f).some((k) => k.startsWith("backend/"))).toBe(true);
    expect("frontend/app/account/settings/page.tsx" in f).toBe(true);
  });

  it("auth-pages contributes backend files, a route, an otp dep, and a frontend page", () => {
    const f = generateProject({ name: "acme", template: "personal", features: ["auth-pages"] });
    expect("backend/src/models/two-factor.ts" in f).toBe(true);
    expect("backend/src/routes/account.ts" in f).toBe(true);
    // Route registered in the manifest, behind auth.
    expect(f["backend/src/routes/index.ts"]).toContain('import accountRoutes from "./account.js"');
    expect(f["backend/src/routes/index.ts"]).toContain('app.use("/account", requireAuth, accountRoutes)');
    // Backend dep merged.
    expect(JSON.parse(f["backend/package.json"]!).dependencies["@lacspace/otp"]).toBeTruthy();
  });

  it("analytics contributes a public collector + protected summary + frontend tracker/dashboard", () => {
    const f = generateProject({ name: "acme", template: "business", features: ["analytics"] });
    expect("backend/src/models/event.ts" in f).toBe(true);
    expect("backend/src/routes/events.ts" in f).toBe(true);
    // Mounted WITHOUT global auth (the collector is public; summary is guarded inside).
    expect(f["backend/src/routes/index.ts"]).toContain('app.use("/events", eventRoutes)');
    expect("frontend/components/analytics.tsx" in f).toBe(true);
    expect("frontend/app/analytics/page.tsx" in f).toBe(true);
    expect(JSON.parse(f["frontend/package.json"]!).dependencies["@lacspace/analytics-lite"]).toBeTruthy();
  });

  it("multiple backend add-ons register distinct routes in the manifest", () => {
    const f = generateProject({ name: "acme", template: "saas", features: ["auth-pages", "analytics"] });
    const idx = f["backend/src/routes/index.ts"]!;
    expect(idx).toContain('app.use("/account", requireAuth, accountRoutes)');
    expect(idx).toContain('app.use("/events", eventRoutes)');
    // Base routes still there.
    expect(idx).toContain('app.use("/auth"');
    expect(idx).toContain('app.use("/notes", noteRoutes)');
  });

  it("payments adds an order model, checkout routes, gateway deps, and gateway env", () => {
    const f = generateProject({ name: "acme", template: "ecommerce", features: ["payments"] });
    expect("backend/src/models/order.ts" in f).toBe(true);
    expect("backend/src/routes/checkout.ts" in f).toBe(true);
    expect("frontend/app/checkout/page.tsx" in f).toBe(true);
    expect("frontend/app/checkout/success/page.tsx" in f).toBe(true);
    const bp = JSON.parse(f["backend/package.json"]!);
    expect(bp.dependencies["@lacspace/esewa"]).toBeTruthy();
    expect(bp.dependencies["@lacspace/khalti"]).toBeTruthy();
    // Gateway env documented in the ROOT .env.example.
    expect(f[".env.example"]).toContain("KHALTI_SECRET");
    expect(f[".env.example"]).toContain("ESEWA_SECRET");
  });

  it("email adds a mail service, a route, mailer deps, and SMTP env", () => {
    const f = generateProject({ name: "acme", template: "saas", features: ["email"] });
    expect("backend/src/mail/mailer.ts" in f).toBe(true);
    expect("backend/src/routes/email.ts" in f).toBe(true);
    expect("frontend/app/email-test/page.tsx" in f).toBe(true);
    const bp = JSON.parse(f["backend/package.json"]!);
    expect(bp.dependencies["@lacspace/mailer"]).toBeTruthy();
    expect(f[".env.example"]).toContain("SMTP_HOST");
    // Dev works with no SMTP — the console fallback is wired.
    expect(f["backend/src/mail/mailer.ts"]).toContain("createJsonTransport");
  });
});

describe("recipes", () => {
  it("listRecipes / getRecipe expose the built-in recipes", () => {
    const keys = listRecipes().map((r) => r.key).sort();
    expect(keys).toEqual(["ai-saas", "blog", "docs-ai", "internal-tool", "store"]);
    expect(getRecipe("ai-saas")?.template).toBe("saas");
    expect(getRecipe("nope")).toBeUndefined();
  });

  it("--recipe ai-saas builds a full-stack app with the whole stack", () => {
    const f = generateProject({ name: "acme", recipe: "ai-saas" });
    const k = Object.keys(f);
    expect(k.some((x) => x.startsWith("backend/"))).toBe(true); // full-stack
    expect(k).toContain("frontend/app/api/chat/route.ts"); // ai-chat
    expect(k).toContain("backend/src/routes/account.ts"); // auth-pages
    expect(k).toContain("backend/src/routes/checkout.ts"); // payments
    expect(k).toContain("backend/src/routes/events.ts"); // analytics
  });

  it("a static recipe (blog) stays static; explicit options merge on top of a recipe", () => {
    const b = generateProject({ name: "acme", recipe: "blog" });
    expect(Object.keys(b).some((x) => x.startsWith("backend/"))).toBe(false);
    expect("app/updates/page.tsx" in b).toBe(true);
    expect("app/api/search/route.ts" in b).toBe(true);
    // Explicit feature adds to the recipe's set.
    const merged = generateProject({ name: "acme", recipe: "blog", features: ["ai-chat"] });
    expect("app/api/chat/route.ts" in merged).toBe(true);
    expect("app/updates/page.tsx" in merged).toBe(true);
  });
});
