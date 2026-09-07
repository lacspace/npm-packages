import { describe, it, expect } from "vitest";
import { Store } from "./db.js";
import { resolveGraphQL, parseQuery } from "./graphql.js";

function store() {
  return new Store({
    users: [
      { id: 1, name: "Ava", role: "admin", city: { name: "Lisbon" } },
      { id: 2, name: "Ben", role: "user", city: { name: "Osaka" } },
    ],
    posts: [{ id: 10, title: "Hello" }],
  });
}

describe("graphql", () => {
  it("parses a simple selection set", () => {
    const fields = parseQuery("{ users { id name } }");
    expect(fields).toHaveLength(1);
    expect(fields[0]!.name).toBe("users");
    expect(fields[0]!.selection.map((f) => f.name)).toEqual(["id", "name"]);
  });

  it("resolves a top-level collection with projection", () => {
    const r = resolveGraphQL(store(), "{ users { id name } }");
    expect(r.errors).toBeUndefined();
    expect(r.data!["users"]).toEqual([
      { id: 1, name: "Ava" },
      { id: 2, name: "Ben" },
    ]);
  });

  it("resolves a single record by id arg", () => {
    const r = resolveGraphQL(store(), "{ users(id: 1) { name } }");
    expect(r.data!["users"]).toEqual({ name: "Ava" });
  });

  it("returns null for a missing id", () => {
    const r = resolveGraphQL(store(), "{ users(id: 99) { name } }");
    expect(r.data!["users"]).toBeNull();
  });

  it("supports multiple top-level fields", () => {
    const r = resolveGraphQL(store(), "{ users(id: 2) { name } posts { title } }");
    expect(r.data!["users"]).toEqual({ name: "Ben" });
    expect(r.data!["posts"]).toEqual([{ title: "Hello" }]);
  });

  it("projects nested objects", () => {
    const r = resolveGraphQL(store(), "{ users(id: 1) { name city { name } } }");
    expect(r.data!["users"]).toEqual({ name: "Ava", city: { name: "Lisbon" } });
  });

  it("applies limit", () => {
    const r = resolveGraphQL(store(), "{ users(limit: 1) { id } }");
    expect(r.data!["users"]).toEqual([{ id: 1 }]);
  });

  it("substitutes variables", () => {
    const r = resolveGraphQL(store(), "{ users(id: $uid) { name } }", { uid: 2 });
    expect(r.data!["users"]).toEqual({ name: "Ben" });
  });

  it("errors on an unknown collection", () => {
    const r = resolveGraphQL(store(), "{ widgets { id } }");
    expect(r.errors && r.errors[0]!.message).toMatch(/no such collection/);
  });

  it("rejects mutations", () => {
    const r = resolveGraphQL(store(), "mutation { addUser { id } }");
    expect(r.errors && r.errors[0]!.message).toMatch(/mutation/i);
  });
});
