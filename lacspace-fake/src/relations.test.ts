import { describe, it, expect } from "vitest";
import { parseRelations, generateDataset, generateRelations } from "./relations.js";

const shop = {
  users: { count: 8, fields: { id: "unique(int(1..100000))", name: "fullName" } },
  orders: { count: 40, fields: { id: "autoincrement", userId: "ref(users.id)", total: "price(5..500)" } },
};

describe("relations parsing", () => {
  it("compiles entities in order", () => {
    const ents = parseRelations(shop);
    expect(ents.map((e) => e.name)).toEqual(["users", "orders"]);
    expect(ents[0]!.count).toBe(8);
  });

  it("rejects a forward / unknown reference", () => {
    expect(() =>
      parseRelations({ orders: { fields: { userId: "ref(users.id)" } } }),
    ).toThrow(/not declared earlier|unknown/i);
  });

  it("rejects an entity without fields", () => {
    expect(() => parseRelations({ users: { count: 3 } })).toThrow(/fields/);
  });

  it("rejects a non-object schema", () => {
    expect(() => parseRelations("nope")).toThrow();
  });
});

describe("referential integrity", () => {
  it("every FK exists in the parent table", () => {
    const data = generateDataset(parseRelations(shop), { count: 0, seed: 42 });
    const userIds = new Set(data["users"]!.map((u) => u["id"]));
    expect(data["orders"]).toHaveLength(40);
    for (const o of data["orders"]!) {
      expect(userIds.has(o["userId"])).toBe(true);
    }
  });

  it("FK is null when the parent produced zero rows", () => {
    const data = generateRelations(
      { a: { count: 0, fields: { id: "autoincrement" } }, b: { count: 5, fields: { aId: "ref(a.id)" } } },
      { seed: 1 },
    );
    for (const r of data["b"]!) expect(r["aId"]).toBeNull();
  });

  it("is deterministic under a seed", () => {
    const a = generateRelations(shop, { seed: 7 });
    const b = generateRelations(shop, { seed: 7 });
    expect(a).toEqual(b);
  });

  it("different seeds diverge", () => {
    const a = generateRelations(shop, { seed: 1 });
    const b = generateRelations(shop, { seed: 2 });
    expect(a).not.toEqual(b);
  });

  it("respects a locale across the dataset", () => {
    const data = generateRelations(
      { users: { count: 5, fields: { country: "country" } } },
      { seed: 1, locale: "fr" },
    );
    for (const u of data["users"]!) expect(u["country"]).toBe("France");
  });
});
