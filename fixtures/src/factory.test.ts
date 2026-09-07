import { beforeEach, describe, expect, it } from "vitest";
import {
  build,
  defineFactory,
  resetSequences,
  seed,
} from "./index";
import type { FactoryDef } from "./index";

interface User {
  id: number;
  name: string;
  email: string;
  age: number;
  active: boolean;
  profile: { bio: string; verified: boolean };
  tags: string[];
}

function userFactory() {
  return defineFactory<User>({
    build: (c) => ({
      id: c.sequence,
      name: `User ${c.sequence}`,
      email: `user${c.sequence}@example.com`,
      age: c.int(18, 65),
      active: c.bool(),
      profile: { bio: c.pick(["hi", "hello", "hey"]), verified: false },
      tags: c.sample(["a", "b", "c", "d"], 2),
    }),
  });
}

describe("defineFactory / build basics", () => {
  beforeEach(() => {
    seed(1234);
    resetSequences();
  });

  it("builds a single fully-typed object", () => {
    const u = userFactory().build();
    expect(u.id).toBe(1);
    expect(u.name).toBe("User 1");
    expect(u.email).toBe("user1@example.com");
    expect(typeof u.age).toBe("number");
    expect(typeof u.active).toBe("boolean");
  });

  it("increments the sequence on each build", () => {
    const f = userFactory();
    expect(f.build().id).toBe(1);
    expect(f.build().id).toBe(2);
    expect(f.build().id).toBe(3);
  });

  it("resetSequences() restarts the sequence at 1", () => {
    const f = userFactory();
    f.build();
    f.build();
    resetSequences();
    expect(f.build().id).toBe(1);
  });

  it("gives independent sequence counters per factory", () => {
    const a = userFactory();
    const b = userFactory();
    a.build();
    a.build();
    expect(b.build().id).toBe(1);
  });

  it("is deterministic for a fixed seed + sequence", () => {
    const first = userFactory().build();
    seed(1234);
    resetSequences();
    const second = userFactory().build();
    expect(second).toEqual(first);
  });

  it("changes output when the seed changes", () => {
    const a = userFactory().build();
    seed(9999);
    resetSequences();
    const b = userFactory().build();
    expect(b.age).not.toBe(a.age);
  });

  it("is order-independent: same seed+sequence => same value", () => {
    const f = userFactory();
    const one = f.build(); // seq 1
    const two = f.build(); // seq 2
    seed(1234);
    resetSequences();
    const g = userFactory();
    expect(g.build()).toEqual(one);
    expect(g.build()).toEqual(two);
  });
});

describe("overrides", () => {
  beforeEach(() => {
    seed(7);
    resetSequences();
  });

  it("applies scalar overrides", () => {
    const u = userFactory().build({ name: "Ada", age: 30 });
    expect(u.name).toBe("Ada");
    expect(u.age).toBe(30);
  });

  it("supports function overrides that receive the ctx", () => {
    const u = userFactory().build({ id: (c) => c.sequence * 100 });
    expect(u.id).toBe(100);
  });

  it("deep-merges nested object overrides", () => {
    const u = userFactory().build({ profile: { verified: true } });
    expect(u.profile.verified).toBe(true);
    // untouched sibling key survives the merge
    expect(typeof u.profile.bio).toBe("string");
  });

  it("replaces arrays wholesale (no array merge)", () => {
    const u = userFactory().build({ tags: ["x"] });
    expect(u.tags).toEqual(["x"]);
  });

  it("nested function overrides receive the ctx too", () => {
    const u = userFactory().build({ profile: { bio: (c) => `seq-${c.sequence}` } });
    expect(u.profile.bio).toBe("seq-1");
  });
});

describe("buildList / buildMany", () => {
  beforeEach(() => {
    seed(5);
    resetSequences();
  });

  it("builds n objects with incrementing sequences", () => {
    const list = userFactory().buildList(3);
    expect(list).toHaveLength(3);
    expect(list.map((u) => u.id)).toEqual([1, 2, 3]);
  });

  it("applies overrides to every element", () => {
    const list = userFactory().buildList(2, { active: true });
    expect(list.every((u) => u.active === true)).toBe(true);
  });

  it("buildMany is an alias of buildList", () => {
    const f = userFactory();
    const a = f.buildMany(2);
    expect(a).toHaveLength(2);
    expect(a[1]!.id).toBe(2);
  });

  it("buildList(0) returns an empty array", () => {
    expect(userFactory().buildList(0)).toEqual([]);
  });
});

describe("transient params", () => {
  beforeEach(() => {
    seed(3);
    resetSequences();
  });

  const withRole = defineFactory<{ id: number; role: string }, { admin: boolean }>({
    transient: { admin: false },
    build: (c) => ({ id: c.sequence, role: c.params.admin ? "admin" : "member" }),
  });

  it("exposes default transient params to build", () => {
    resetSequences();
    expect(withRole.build().role).toBe("member");
  });

  it("lets a build override transient params without leaking them into output", () => {
    resetSequences();
    const obj = withRole.build({ transient: { admin: true } });
    expect(obj.role).toBe("admin");
    expect("admin" in obj).toBe(false);
    expect("transient" in obj).toBe(false);
  });
});

describe("afterBuild hooks", () => {
  beforeEach(() => {
    seed(11);
    resetSequences();
  });

  it("runs a def-level afterBuild hook (mutation)", () => {
    const f = defineFactory<{ n: number; doubled?: number }>({
      build: (c) => ({ n: c.sequence }),
      afterBuild: (o) => {
        o.doubled = o.n * 2;
      },
    });
    expect(f.build().doubled).toBe(2);
  });

  it("supports a returned replacement from afterBuild", () => {
    const f = defineFactory<{ n: number }>({
      build: (c) => ({ n: c.sequence }),
      afterBuild: (o) => ({ n: o.n + 10 }),
    });
    expect(f.build().n).toBe(11);
  });

  it("registers extra hooks via factory.afterBuild() and chains", () => {
    const f = defineFactory<{ n: number; flag?: boolean }>({
      build: (c) => ({ n: c.sequence }),
    });
    const same = f.afterBuild((o) => {
      o.flag = true;
    });
    expect(same).toBe(f);
    expect(f.build().flag).toBe(true);
  });
});

describe("build() shortcut", () => {
  beforeEach(() => {
    seed(1);
    resetSequences();
  });

  it("builds from a factory", () => {
    const f = userFactory();
    expect(build(f, { name: "Z" }).name).toBe("Z");
  });

  it("builds from a raw definition", () => {
    const def: FactoryDef<{ v: number }> = { build: (c) => ({ v: c.sequence }) };
    const obj = build(def);
    expect(obj.v).toBe(1);
  });
});
