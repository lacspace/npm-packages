import { beforeEach, describe, expect, it } from "vitest";
import { defineFactory, resetSequences, seed } from "./index";

interface Account {
  id: number;
  role: "guest" | "member" | "admin";
  verified: boolean;
  plan: string;
}

function accountFactory() {
  return defineFactory<Account>({
    build: (c) => ({
      id: c.sequence,
      role: "member",
      verified: false,
      plan: "free",
    }),
    traits: {
      admin: { role: "admin", verified: true },
      verified: { verified: true },
      pro: (c) => ({ plan: `pro-${c.sequence}` }),
    },
  });
}

describe("traits", () => {
  beforeEach(() => {
    seed(100);
    resetSequences();
  });

  it("exposes the trait names", () => {
    expect(accountFactory().traitNames.sort()).toEqual(["admin", "pro", "verified"]);
  });

  it("applies a trait via build({ traits })", () => {
    const a = accountFactory().build({ traits: ["admin"] });
    expect(a.role).toBe("admin");
    expect(a.verified).toBe(true);
  });

  it("applies a function trait with ctx", () => {
    const a = accountFactory().build({ traits: ["pro"] });
    expect(a.plan).toBe("pro-1");
  });

  it("applies multiple traits in order", () => {
    const a = accountFactory().build({ traits: ["verified", "admin", "pro"] });
    expect(a.role).toBe("admin");
    expect(a.verified).toBe(true);
    expect(a.plan).toBe("pro-1");
  });

  it("lets explicit overrides win over traits", () => {
    const a = accountFactory().build({ traits: ["admin"], role: "guest" });
    expect(a.role).toBe("guest");
  });

  it("supports the withTrait() chained builder", () => {
    const a = accountFactory().withTrait("admin").build();
    expect(a.role).toBe("admin");
  });

  it("chains multiple withTrait() calls", () => {
    const a = accountFactory().withTrait("admin").withTrait("pro").build();
    expect(a.role).toBe("admin");
    expect(a.plan).toBe("pro-1");
  });

  it("withTrait().buildList applies the trait to each", () => {
    const list = accountFactory().withTrait("admin").buildList(3);
    expect(list).toHaveLength(3);
    expect(list.every((a) => a.role === "admin")).toBe(true);
    expect(list.map((a) => a.id)).toEqual([1, 2, 3]);
  });

  it("throws on an unknown trait", () => {
    expect(() => accountFactory().build({ traits: ["nope"] })).toThrow(/Unknown trait/);
  });
});

describe("extend", () => {
  beforeEach(() => {
    seed(200);
    resetSequences();
  });

  it("derives a factory that adds fields", () => {
    const base = accountFactory();
    const withOrg = base.extend<{ org: string }>({
      build: (c) => ({ org: `org-${c.sequence}` }),
    });
    const a = withOrg.build();
    expect(a.org).toBe("org-1");
    expect(a.role).toBe("member");
  });

  it("derives a factory that overrides base fields", () => {
    const admins = accountFactory().extend({ build: () => ({ role: "admin" as const }) });
    expect(admins.build().role).toBe("admin");
  });

  it("inherits the parent traits", () => {
    const ext = accountFactory().extend<{ org: string }>({
      build: () => ({ org: "x" }),
    });
    expect(ext.build({ traits: ["admin"] }).role).toBe("admin");
  });

  it("adds new traits via a bare traits map", () => {
    const ext = accountFactory().extend({
      staff: { plan: "staff" },
    });
    expect(ext.build({ traits: ["staff"] }).plan).toBe("staff");
    // parent trait still present
    expect(ext.build({ traits: ["admin"] }).role).toBe("admin");
  });

  it("chains parent + child afterBuild hooks", () => {
    const base = defineFactory<{ n: number; log: string[] }>({
      build: (c) => ({ n: c.sequence, log: [] }),
      afterBuild: (o) => {
        o.log.push("parent");
      },
    });
    const child = base.extend<{ log: string[] }>({
      afterBuild: (o: { n: number; log: string[] }) => {
        o.log.push("child");
      },
    });
    expect(child.build().log).toEqual(["parent", "child"]);
  });
});
