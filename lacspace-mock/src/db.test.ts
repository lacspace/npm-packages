import { describe, it, expect, vi } from "vitest";
import { Store } from "./db.js";

function fresh() {
  return new Store({
    users: [
      { id: 1, name: "Ava" },
      { id: 2, name: "Ben" },
    ],
    profile: { theme: "dark" },
  });
}

describe("Store", () => {
  it("lists collections and detects singular resources", () => {
    const s = fresh();
    expect(s.collections()).toEqual(["users"]);
    expect(s.has("users")).toBe(true);
    expect(s.has("posts")).toBe(false);
    expect(s.singular("profile")).toEqual({ theme: "dark" });
  });

  it("gets by id with string coercion", () => {
    const s = fresh();
    expect(s.get("users", "1")).toEqual({ id: 1, name: "Ava" });
    expect(s.get("users", "99")).toBeUndefined();
  });

  it("creates with an auto-incremented numeric id", () => {
    const s = fresh();
    const created = s.create("users", { name: "Cara" });
    expect(created["id"]).toBe(3);
    expect(s.list("users")).toHaveLength(3);
  });

  it("creates a new collection on demand", () => {
    const s = fresh();
    s.create("posts", { title: "hi" });
    expect(s.has("posts")).toBe(true);
  });

  it("replace (PUT) drops old fields but keeps id", () => {
    const s = fresh();
    const r = s.replace("users", "1", { nickname: "A" });
    expect(r).toEqual({ id: 1, nickname: "A" });
    expect(r).not.toHaveProperty("name");
  });

  it("patch (PATCH) merges fields", () => {
    const s = fresh();
    const r = s.patch("users", "1", { age: 30 });
    expect(r).toEqual({ id: 1, name: "Ava", age: 30 });
  });

  it("cannot change id via patch/replace", () => {
    const s = fresh();
    expect(s.patch("users", "1", { id: 999 })!["id"]).toBe(1);
    expect(s.replace("users", "1", { id: 999 })!["id"]).toBe(1);
  });

  it("remove deletes and reports", () => {
    const s = fresh();
    expect(s.remove("users", "1")).toBe(true);
    expect(s.remove("users", "1")).toBe(false);
    expect(s.list("users")).toHaveLength(1);
  });

  it("fires onChange for mutations", () => {
    const onChange = vi.fn();
    const s = new Store({ users: [] }, { onChange });
    s.create("users", { name: "X" });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("honours a custom idKey", () => {
    const s = new Store({ items: [{ _id: 5 }] }, { idKey: "_id" });
    expect(s.get("items", "5")).toEqual({ _id: 5 });
    expect(s.create("items", {})["_id"]).toBe(6);
  });
});
