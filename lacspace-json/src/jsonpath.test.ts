import { describe, it, expect } from "vitest";
import { jsonPath, jsonPathPaths, isJsonPath, isValidJsonPath } from "./jsonpath.js";
import type { JsonValue } from "./util.js";

const store: JsonValue = {
  store: {
    book: [
      { category: "reference", author: "Nigel Rees", title: "Sayings of the Century", price: 8.95 },
      { category: "fiction", author: "Evelyn Waugh", title: "Sword of Honour", price: 12.99 },
      { category: "fiction", author: "Herman Melville", title: "Moby Dick", isbn: "0-553-21311-3", price: 8.99 },
      { category: "fiction", author: "J. R. R. Tolkien", title: "The Lord of the Rings", isbn: "0-395-19395-8", price: 22.99 },
    ],
    bicycle: { color: "red", price: 19.95 },
  },
};

describe("JSONPath selectors", () => {
  it("child navigation", () => {
    expect(jsonPath(store, "$.store.bicycle.color")).toEqual(["red"]);
  });
  it("wildcard over array", () => {
    expect(jsonPath(store, "$.store.book[*].price")).toEqual([8.95, 12.99, 8.99, 22.99]);
  });
  it("wildcard with .* ", () => {
    expect(jsonPath(store, "$.store.bicycle.*")).toEqual(["red", 19.95]);
  });
  it("array index and negative index", () => {
    expect(jsonPath(store, "$.store.book[0].author")).toEqual(["Nigel Rees"]);
    expect(jsonPath(store, "$.store.book[-1].author")).toEqual(["J. R. R. Tolkien"]);
  });
  it("bracket-quoted names", () => {
    expect(jsonPath(store, "$['store']['bicycle']['price']")).toEqual([19.95]);
  });
  it("recursive descent gathers all matches", () => {
    expect(jsonPath(store, "$..author")).toEqual(["Nigel Rees", "Evelyn Waugh", "Herman Melville", "J. R. R. Tolkien"]);
  });
  it("recursive descent of all prices", () => {
    expect(jsonPath(store, "$..price")).toEqual([8.95, 12.99, 8.99, 22.99, 19.95]);
  });
  it("union of indices", () => {
    expect(jsonPath(store, "$.store.book[0,2].price")).toEqual([8.95, 8.99]);
  });
  it("array slice", () => {
    expect(jsonPath(store, "$.store.book[0:2].price")).toEqual([8.95, 12.99]);
  });
  it("slice with step", () => {
    expect(jsonPath(store, "$.store.book[::2].price")).toEqual([8.95, 8.99]);
  });
  it("filter by numeric comparison", () => {
    expect(jsonPath(store, "$.store.book[?(@.price < 10)].title")).toEqual(["Sayings of the Century", "Moby Dick"]);
  });
  it("filter by existence", () => {
    expect(jsonPath(store, "$.store.book[?(@.isbn)].title")).toEqual(["Moby Dick", "The Lord of the Rings"]);
  });
  it("filter by string equality", () => {
    expect(jsonPath(store, "$.store.book[?(@.category == 'reference')].author")).toEqual(["Nigel Rees"]);
  });
  it("filter with && and ||", () => {
    expect(jsonPath(store, "$.store.book[?(@.category == 'fiction' && @.price < 10)].title")).toEqual(["Moby Dick"]);
    expect(jsonPath(store, "$..book[?(@.price < 9 || @.price > 20)].title")).toEqual(["Sayings of the Century", "Moby Dick", "The Lord of the Rings"]);
  });
  it("filter with regex =~", () => {
    expect(jsonPath(store, "$..book[?(@.author =~ /Tolkien/)].title")).toEqual(["The Lord of the Rings"]);
  });
  it("recursive filter across the whole tree", () => {
    expect(jsonPath(store, "$..[?(@.price < 10)].title").sort()).toEqual(["Moby Dick", "Sayings of the Century"]);
  });
  it("returns pointer paths of matches", () => {
    expect(jsonPathPaths(store, "$.store.book[0].price")).toEqual(["/store/book/0/price"]);
  });
  it("recognizes and validates JSONPath", () => {
    expect(isJsonPath("$.a")).toBe(true);
    expect(isJsonPath(".a")).toBe(false);
    expect(isValidJsonPath("$.store.book[*]")).toBe(true);
    expect(isValidJsonPath("$.store.book[")).toBe(false);
  });
  it("missing paths yield an empty set", () => {
    expect(jsonPath(store, "$.store.nope")).toEqual([]);
  });
});
