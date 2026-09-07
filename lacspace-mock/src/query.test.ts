import { describe, it, expect } from "vitest";
import { runQuery, parseQueryString } from "./query.js";

const people = [
  { id: 1, name: "Ava", role: "admin", age: 30 },
  { id: 2, name: "Ben", role: "user", age: 22 },
  { id: 3, name: "Cara", role: "user", age: 40 },
  { id: 4, name: "Alan", role: "admin", age: 18 },
];

describe("query engine", () => {
  it("returns all rows with no query", () => {
    const { data, total } = runQuery(people, {});
    expect(total).toBe(4);
    expect(data).toHaveLength(4);
  });

  it("filters by exact field", () => {
    const { data, total } = runQuery(people, { role: "admin" });
    expect(total).toBe(2);
    expect(data.map((r) => r["id"])).toEqual([1, 4]);
  });

  it("supports repeated key as OR (any-of)", () => {
    const { data } = runQuery(people, { id: ["1", "3"] });
    expect(data.map((r) => r["id"])).toEqual([1, 3]);
  });

  it("_gte / _lte operators", () => {
    const { data } = runQuery(people, { age_gte: "22", age_lte: "30" });
    expect(data.map((r) => r["id"])).toEqual([1, 2]);
  });

  it("_ne operator", () => {
    const { data } = runQuery(people, { role_ne: "admin" });
    expect(data.map((r) => r["id"])).toEqual([2, 3]);
  });

  it("_like operator (case-insensitive)", () => {
    const { data } = runQuery(people, { name_like: "a" });
    expect(data.map((r) => r["name"])).toEqual(["Ava", "Cara", "Alan"]);
  });

  it("full-text q searches across fields", () => {
    const { data } = runQuery(people, { q: "admin" });
    expect(data).toHaveLength(2);
  });

  it("sorts asc and desc", () => {
    expect(runQuery(people, { _sort: "age" }).data.map((r) => r["age"])).toEqual([18, 22, 30, 40]);
    expect(runQuery(people, { _sort: "age", _order: "desc" }).data.map((r) => r["age"])).toEqual([40, 30, 22, 18]);
  });

  it("multi-key sort", () => {
    const { data } = runQuery(people, { _sort: "role,age", _order: "asc,desc" });
    expect(data.map((r) => r["id"])).toEqual([1, 4, 3, 2]);
  });

  it("paginates with _page/_limit and keeps total", () => {
    const { data, total } = runQuery(people, { _page: "2", _limit: "2" });
    expect(total).toBe(4);
    expect(data.map((r) => r["id"])).toEqual([3, 4]);
  });

  it("_start/_end slice", () => {
    const { data } = runQuery(people, { _start: "1", _end: "3" });
    expect(data.map((r) => r["id"])).toEqual([2, 3]);
  });

  it("parseQueryString collects repeated keys into arrays", () => {
    expect(parseQueryString("?id=1&id=2&role=admin")).toEqual({ id: ["1", "2"], role: "admin" });
  });
});
