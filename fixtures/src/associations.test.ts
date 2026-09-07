import { beforeEach, describe, expect, it, vi } from "vitest";
import { assoc, defineFactory, resetSequences, seed } from "./index";

interface User {
  id: number;
  name: string;
}
interface Post {
  id: number;
  title: string;
  author: User;
  comments: { id: number; body: string }[];
}

function userFactory() {
  return defineFactory<User>({
    build: (c) => ({ id: c.sequence, name: `User ${c.sequence}` }),
  });
}

describe("associations", () => {
  beforeEach(() => {
    seed(50);
    resetSequences();
  });

  it("builds an associated factory via assoc()", () => {
    const users = userFactory();
    const posts = defineFactory<Post>({
      build: (c) => ({
        id: c.sequence,
        title: `Post ${c.sequence}`,
        author: assoc(users),
        comments: [],
      }),
    });
    const p = posts.build();
    expect(p.author).toEqual({ id: 1, name: "User 1" });
  });

  it("passes overrides through assoc()", () => {
    const users = userFactory();
    const posts = defineFactory<Post>({
      build: (c) => ({
        id: c.sequence,
        title: "t",
        author: assoc(users, { name: "Named" }),
        comments: [],
      }),
    });
    expect(posts.build().author.name).toBe("Named");
  });

  it("does NOT build the association when the field is overridden (lazy)", () => {
    const spy = vi.fn((c: { sequence: number }) => ({ id: c.sequence, name: "spy" }));
    const users = defineFactory<User>({ build: spy });
    const posts = defineFactory<Post>({
      build: (c) => ({ id: c.sequence, title: "t", author: assoc(users), comments: [] }),
    });
    const p = posts.build({ author: { id: 99, name: "given" } });
    expect(p.author).toEqual({ id: 99, name: "given" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("resolves a Factory dropped directly into a field", () => {
    const users = userFactory();
    const posts = defineFactory<Post>({
      build: (c) => ({
        id: c.sequence,
        title: "t",
        // a bare factory is treated as an association built with no overrides
        author: users as unknown as User,
        comments: [],
      }),
    });
    expect(posts.build().author).toEqual({ id: 1, name: "User 1" });
  });

  it("resolves associations nested inside arrays", () => {
    const users = userFactory();
    const team = defineFactory<{ members: User[] }>({
      build: () => ({ members: [assoc(users), assoc(users)] }),
    });
    const t = team.build();
    expect(t.members).toHaveLength(2);
    expect(t.members[0]!.id).not.toBe(t.members[1]!.id);
  });

  it("is deterministic for parent + child under a fixed seed", () => {
    const build1 = (() => {
      seed(77);
      resetSequences();
      const users = userFactory();
      const posts = defineFactory<Post>({
        build: (c) => ({ id: c.sequence, title: `p${c.sequence}`, author: assoc(users), comments: [] }),
      });
      return posts.build();
    })();
    const build2 = (() => {
      seed(77);
      resetSequences();
      const users = userFactory();
      const posts = defineFactory<Post>({
        build: (c) => ({ id: c.sequence, title: `p${c.sequence}`, author: assoc(users), comments: [] }),
      });
      return posts.build();
    })();
    expect(build2).toEqual(build1);
  });
});
