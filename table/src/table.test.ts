import { describe, it, expect } from "vitest";
import {
  aggregate,
  clampColumnWidth,
  clampPage,
  cycleSort,
  defaultCompare,
  escapeCell,
  exportRows,
  filterRows,
  isIndeterminate,
  matchesFilter,
  matchesQuery,
  neutraliseFormula,
  pageForSizeChange,
  pageRange,
  pageSlice,
  pageTokens,
  pinnedOffsets,
  pruneSelection,
  resizeColumn,
  selectionMode,
  setSelection,
  sortRows,
  toCsv,
  toTsv,
  toggleSelected,
  type FilterField,
  type SortField,
} from "./engine.js";
import { columnReader, exportColumnsFrom, resolveColumns, toDate } from "./columns.js";

/* ==========================================================================
   Fixtures
   ========================================================================== */

interface Person {
  id: string;
  name: string;
  score: number | null;
  joined: Date | null;
  team: string;
  active: boolean;
}

const person = (
  id: string,
  name: string,
  score: number | null,
  team: string,
  joined: string | null = "2024-01-01",
  active = true,
): Person => ({
  id,
  name,
  score,
  team,
  joined: joined === null ? null : new Date(joined),
  active,
});

const people: Person[] = [
  person("1", "Ana", 30, "red", "2024-03-01"),
  person("2", "bob", 10, "blue", "2023-06-15"),
  person("3", "Émile", null, "red", null, false),
  person("4", "Chloé", 30, "blue", "2025-01-20"),
  person("5", "dave", 5, "red", "2022-11-02", false),
];

const sortFields: Record<string, SortField<Person>> = {
  name: { getValue: (row) => row.name },
  score: { getValue: (row) => row.score },
  joined: { getValue: (row) => row.joined },
  team: { getValue: (row) => row.team },
};

const filterFields: Record<string, FilterField<Person>> = {
  name: { getValue: (row) => row.name },
  score: { getValue: (row) => row.score },
  team: { getValue: (row) => row.team },
  active: { getValue: (row) => row.active, searchable: false },
};

const names = (rows: readonly Person[]): string[] => rows.map((row) => row.name);

/* ==========================================================================
   Sorting
   ========================================================================== */

describe("sorting", () => {
  it("orders strings the way a reader expects, not by character code", () => {
    const sorted = sortRows(people, [{ id: "name", direction: "asc" }], sortFields, "en");
    expect(names(sorted)).toEqual(["Ana", "bob", "Chloé", "dave", "Émile"]);
  });

  it("orders numbers by magnitude rather than as text", () => {
    const rows = [{ n: 9 }, { n: 100 }, { n: 20 }];
    const sorted = sortRows(rows, [{ id: "n", direction: "asc" }], { n: { getValue: (r) => r.n } });
    expect(sorted.map((r) => r.n)).toEqual([9, 20, 100]);
  });

  it("orders dates chronologically", () => {
    const sorted = sortRows(
      people.filter((p) => p.joined),
      [{ id: "joined", direction: "asc" }],
      sortFields,
    );
    expect(names(sorted)).toEqual(["dave", "bob", "Ana", "Chloé"]);
  });

  it("keeps blank values last when sorting ascending", () => {
    const sorted = sortRows(people, [{ id: "score", direction: "asc" }], sortFields);
    expect(names(sorted)).toEqual(["dave", "bob", "Ana", "Chloé", "Émile"]);
  });

  it("keeps blank values last when sorting descending too", () => {
    const sorted = sortRows(people, [{ id: "score", direction: "desc" }], sortFields);
    expect(names(sorted).at(-1)).toBe("Émile");
    expect(names(sorted).slice(0, 2)).toEqual(["Ana", "Chloé"]);
  });

  it("breaks ties with the next sort key", () => {
    const sorted = sortRows(
      people,
      [
        { id: "score", direction: "desc" },
        { id: "name", direction: "asc" },
      ],
      sortFields,
      "en",
    );
    expect(names(sorted).slice(0, 2)).toEqual(["Ana", "Chloé"]);
  });

  it("leaves equal rows in their original order", () => {
    const rows = [
      { id: "a", group: 1 },
      { id: "b", group: 1 },
      { id: "c", group: 1 },
    ];
    const sorted = sortRows(rows, [{ id: "group", direction: "desc" }], {
      group: { getValue: (r) => r.group },
    });
    expect(sorted.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("uses a column's own comparator when one is given", () => {
    const order = ["low", "medium", "high"];
    const rows = [{ p: "high" }, { p: "low" }, { p: "medium" }];
    const sorted = sortRows(rows, [{ id: "p", direction: "asc" }], {
      p: {
        getValue: (r) => r.p,
        compare: (a, b) => order.indexOf(String(a)) - order.indexOf(String(b)),
      },
    });
    expect(sorted.map((r) => r.p)).toEqual(["low", "medium", "high"]);
  });

  it("sorts numbers inside strings naturally", () => {
    expect(defaultCompare("item 2", "item 10")).toBeLessThan(0);
  });

  it("cycles a header through ascending, descending and unsorted", () => {
    const first = cycleSort([], "name");
    expect(first).toEqual([{ id: "name", direction: "asc" }]);
    const second = cycleSort(first, "name");
    expect(second).toEqual([{ id: "name", direction: "desc" }]);
    expect(cycleSort(second, "name")).toEqual([]);
  });

  it("appends a second sort key on a shift-click instead of replacing the first", () => {
    const sort = cycleSort([{ id: "team", direction: "asc" }], "score", { additive: true });
    expect(sort).toEqual([
      { id: "team", direction: "asc" },
      { id: "score", direction: "asc" },
    ]);
  });

  it("ignores sort rules for columns that no longer exist", () => {
    const sorted = sortRows(people, [{ id: "ghost", direction: "asc" }], sortFields);
    expect(names(sorted)).toEqual(names(people));
  });
});

/* ==========================================================================
   Filtering + search
   ========================================================================== */

describe("filtering", () => {
  it("matches a text filter without caring about case", () => {
    const rows = filterRows(people, filterFields, { filters: { name: "AN" } });
    expect(names(rows)).toEqual(["Ana"]);
  });

  it("matches a numeric range inclusively at both ends", () => {
    const rows = filterRows(people, filterFields, { filters: { score: { min: 10, max: 30 } } });
    expect(names(rows)).toEqual(["Ana", "bob", "Chloé"]);
  });

  it("drops blank values from a numeric range rather than treating them as zero", () => {
    const rows = filterRows(people, filterFields, { filters: { score: { max: 100 } } });
    expect(names(rows)).not.toContain("Émile");
  });

  it("treats a list filter as 'one of'", () => {
    const rows = filterRows(people, filterFields, { filters: { team: ["blue"] } });
    expect(names(rows)).toEqual(["bob", "Chloé"]);
  });

  it("matches a boolean filter on truthiness", () => {
    const rows = filterRows(people, filterFields, { filters: { active: false } });
    expect(names(rows)).toEqual(["Émile", "dave"]);
  });

  it("lets a column replace the matcher with its own predicate", () => {
    const fields: Record<string, FilterField<Person>> = {
      ...filterFields,
      name: {
        getValue: (row) => row.name,
        filterFn: (value, filter) => String(value).toLowerCase().startsWith(String(filter).toLowerCase()),
      },
    };
    expect(names(filterRows(people, fields, { filters: { name: "b" } }))).toEqual(["bob"]);
  });

  it("passes everything through when a filter is empty", () => {
    expect(matchesFilter("anything", "")).toBe(true);
    expect(matchesFilter("anything", [])).toBe(true);
    expect(matchesFilter("anything", { min: null, max: null })).toBe(true);
    expect(filterRows(people, filterFields, { filters: { name: "" } })).toHaveLength(people.length);
  });

  it("combines several column filters with AND", () => {
    const rows = filterRows(people, filterFields, {
      filters: { team: "red", score: { min: 10 } },
    });
    expect(names(rows)).toEqual(["Ana"]);
  });

  it("searches across every searchable column at once", () => {
    expect(names(filterRows(people, filterFields, { query: "blue" }))).toEqual(["bob", "Chloé"]);
  });

  it("limits the search to the named columns when asked", () => {
    const rows = filterRows(people, filterFields, { query: "blue", searchIds: ["name"] });
    expect(rows).toHaveLength(0);
  });

  it("requires every search term to match, not just one", () => {
    expect(matchesQuery(people[0] as Person, "ana red", filterFields)).toBe(true);
    expect(matchesQuery(people[0] as Person, "ana blue", filterFields)).toBe(false);
  });

  it("keeps columns marked unsearchable out of the global search", () => {
    expect(matchesQuery(people[0] as Person, "true", filterFields)).toBe(false);
  });
});

/* ==========================================================================
   Pagination
   ========================================================================== */

describe("pagination", () => {
  it("pulls the reader back to the last real page when the rows shrink", () => {
    expect(clampPage(8, 12, 10)).toBe(1);
    expect(clampPage(8, 3, 10)).toBe(0);
  });

  it("never returns a negative page", () => {
    expect(clampPage(-4, 100, 10)).toBe(0);
  });

  it("slices the right window of rows", () => {
    const rows = Array.from({ length: 25 }, (_, i) => i);
    expect(pageSlice(rows, 2, 10)).toEqual([20, 21, 22, 23, 24]);
  });

  it("stays correct for 10k rows", () => {
    const rows = Array.from({ length: 10_000 }, (_, i) => i);
    const page = pageSlice(rows, 250, 20);
    expect(page).toHaveLength(20);
    expect(page[0]).toBe(5000);
    expect(pageSlice(rows, 499, 20).at(-1)).toBe(9999);
    // Past the end lands on the last page, never on an empty one.
    expect(pageSlice(rows, 900, 20)[0]).toBe(9980);
  });

  it("keeps the first visible row on screen across a page-size change", () => {
    // Page 3 at 10 per page starts at row 30; at 25 per page that row is on page 1.
    expect(pageForSizeChange(3, 10, 25)).toBe(1);
    expect(pageForSizeChange(1, 25, 10)).toBe(2);
    expect(pageForSizeChange(0, 10, 50)).toBe(0);
  });

  it("reports a 1-based range for the summary line", () => {
    expect(pageRange(2, 10, 173)).toEqual({ from: 21, to: 30, total: 173 });
    expect(pageRange(17, 10, 173)).toEqual({ from: 171, to: 173, total: 173 });
    expect(pageRange(0, 10, 0)).toEqual({ from: 0, to: 0, total: 0 });
  });

  it("builds page buttons with gaps around the current page", () => {
    expect(pageTokens(0, 3)).toEqual([0, 1, 2]);
    expect(pageTokens(0, 20, 7)).toEqual([0, 1, 2, 3, 4, 5, "ellipsis", 19]);
    expect(pageTokens(10, 20, 7)).toEqual([0, "ellipsis", 8, 9, 10, 11, 12, "ellipsis", 19]);
    expect(pageTokens(19, 20, 7)).toEqual([0, "ellipsis", 14, 15, 16, 17, 18, 19]);
  });
});

/* ==========================================================================
   Selection
   ========================================================================== */

describe("selection", () => {
  it("adds and removes one row", () => {
    expect(toggleSelected([], "a")).toEqual(["a"]);
    expect(toggleSelected(["a", "b"], "a")).toEqual(["b"]);
    expect(toggleSelected(["a"], "a", true)).toEqual(["a"]);
  });

  it("selects every row on the page without touching the rest", () => {
    const next = setSelection(["z"], ["a", "b"], true);
    expect(next).toEqual(["z", "a", "b"]);
    expect(setSelection(next, ["a", "b"], false)).toEqual(["z"]);
  });

  it("never selects the same row twice", () => {
    expect(setSelection(["a"], ["a", "b"], true)).toEqual(["a", "b"]);
  });

  it("derives the header checkbox's three states", () => {
    expect(selectionMode([], ["a", "b"])).toBe("none");
    expect(selectionMode(["a"], ["a", "b"])).toBe("some");
    expect(selectionMode(["a", "b"], ["a", "b"])).toBe("all");
    expect(isIndeterminate(["a"], ["a", "b"])).toBe(true);
    expect(isIndeterminate(["a", "b"], ["a", "b"])).toBe(false);
  });

  it("survives a page change, so selections do not vanish when you browse", () => {
    const pageOne = ["a", "b"];
    const pageTwo = ["c", "d"];
    const afterPageOne = setSelection([], pageOne, true);
    const afterPageTwo = setSelection(afterPageOne, ["c"], true);
    expect(afterPageTwo).toEqual(["a", "b", "c"]);
    expect(selectionMode(afterPageTwo, pageTwo)).toBe("some");
    expect(selectionMode(afterPageTwo, pageOne)).toBe("all");
  });

  it("forgets rows that no longer exist when asked to prune", () => {
    expect(pruneSelection(["a", "gone"], ["a", "b"])).toEqual(["a"]);
  });
});

/* ==========================================================================
   Column sizing
   ========================================================================== */

describe("column sizing", () => {
  it("clamps a resize to the column's own bounds", () => {
    expect(clampColumnWidth(10, 80, 400)).toBe(80);
    expect(clampColumnWidth(900, 80, 400)).toBe(400);
    expect(clampColumnWidth(220, 80, 400)).toBe(220);
  });

  it("falls back to the minimum for a width that is not a number", () => {
    expect(clampColumnWidth(Number.NaN, 90, 400)).toBe(90);
  });

  it("applies a drag delta from the starting width", () => {
    expect(resizeColumn(200, 45)).toBe(245);
    expect(resizeColumn(200, -400, 120)).toBe(120);
  });

  it("stacks pinned columns against their edge", () => {
    expect(pinnedOffsets([44, 160, 120], "left")).toEqual([0, 44, 204]);
    expect(pinnedOffsets([100, 80], "right")).toEqual([80, 0]);
  });
});

/* ==========================================================================
   Aggregates
   ========================================================================== */

describe("aggregates", () => {
  it("sums a column, ignoring blanks", () => {
    expect(aggregate([1, 2, null, 3], "sum")).toBe(6);
  });

  it("averages over the values that exist, not over the blanks", () => {
    expect(aggregate([3, null, 5], "avg")).toBe(4);
  });

  it("reports min and max", () => {
    expect(aggregate([3, null, 5, -2], "min")).toBe(-2);
    expect(aggregate([3, null, 5, -2], "max")).toBe(5);
  });

  it("counts non-blank values of any type", () => {
    expect(aggregate(["a", "", null, undefined, 0], "count")).toBe(3);
  });

  it("has no honest answer for an average of nothing, but sums to zero", () => {
    expect(aggregate([null, undefined], "avg")).toBeNull();
    expect(aggregate([], "min")).toBeNull();
    expect(aggregate([], "sum")).toBe(0);
  });

  it("reads numbers out of formatted strings", () => {
    expect(aggregate(["1,200", "300"], "sum")).toBe(1500);
  });
});

/* ==========================================================================
   Export
   ========================================================================== */

describe("CSV export", () => {
  it("quotes a value containing the delimiter", () => {
    expect(escapeCell("Doe, Jane")).toBe('"Doe, Jane"');
    expect(escapeCell("Doe, Jane", "\t")).toBe("Doe, Jane");
  });

  it("doubles embedded quotes", () => {
    expect(escapeCell('He said "hi"')).toBe('"He said ""hi"""');
  });

  it("quotes a value containing a newline", () => {
    expect(escapeCell("line one\nline two")).toBe('"line one\nline two"');
  });

  it("neutralises a leading =, +, - or @ so a spreadsheet cannot execute it", () => {
    expect(neutraliseFormula("=1+1")).toBe("'=1+1");
    expect(neutraliseFormula("+SUM(A1)")).toBe("'+SUM(A1)");
    expect(neutraliseFormula("@import")).toBe("'@import");
    expect(neutraliseFormula("-cmd|' /c calc'!A0")).toBe("'-cmd|' /c calc'!A0");
  });

  it("leaves a plain negative number alone, formula prefix or not", () => {
    expect(neutraliseFormula("-12.5")).toBe("-12.5");
    expect(escapeCell(-12.5)).toBe("-12.5");
  });

  it("quotes and neutralises together when a value needs both", () => {
    expect(escapeCell('=HYPERLINK("a","b")')).toBe('"\'=HYPERLINK(""a"",""b"")"');
  });

  it("writes blanks as empty cells rather than the word null", () => {
    expect(toCsv([[null, undefined, 0]])).toBe(",,0");
  });

  it("joins a matrix into CSV and TSV", () => {
    expect(toCsv([["a", "b"], [1, 2]])).toBe("a,b\r\n1,2");
    expect(toTsv([["a", "b"], [1, 2]])).toBe("a\tb\r\n1\t2");
  });

  it("exports rows through the column definitions, header first", () => {
    const csv = exportRows(people.slice(0, 2), [
      { header: "Name", value: (row) => row.name },
      { header: "Score", value: (row) => row.score },
    ]);
    expect(csv).toBe("Name,Score\r\nAna,30\r\nbob,10");
  });

  it("can leave the header out", () => {
    const csv = exportRows([{ a: 1 }], [{ header: "A", value: (row) => row.a }], { header: false });
    expect(csv).toBe("1");
  });

  it("exports dates as ISO instants, not as locale text", () => {
    const csv = exportRows([{ d: new Date("2024-03-01T00:00:00Z") }], [
      { header: "Joined", value: (row) => row.d },
    ]);
    expect(csv).toBe("Joined\r\n2024-03-01T00:00:00.000Z");
  });
});

/* ==========================================================================
   Columns
   ========================================================================== */

describe("column definitions", () => {
  it("reads a value by key when no accessor is given", () => {
    const read = columnReader<Person>({ id: "name", key: "name" });
    expect(read(people[0] as Person)).toBe("Ana");
  });

  it("fills in the defaults a column did not state", () => {
    const [column] = resolveColumns<Person>([{ id: "name", key: "name" }]);
    expect(column?.sortable).toBe(true);
    expect(column?.align).toBe("start");
    expect(column?.name).toBe("name");
    expect(column?.pinned).toBe(false);
  });

  it("leaves action columns out of the export", () => {
    const columns = resolveColumns<Person>([
      { id: "name", key: "name", header: "Name" },
      { id: "actions", exportable: false },
    ]);
    expect(exportColumnsFrom(columns).map((c) => c.header)).toEqual(["Name"]);
  });

  it("parses dates and refuses to produce an Invalid Date", () => {
    expect(toDate("2024-03-01")?.getUTCFullYear()).toBe(2024);
    expect(toDate("not a date")).toBeNull();
    expect(toDate(null)).toBeNull();
  });
});
