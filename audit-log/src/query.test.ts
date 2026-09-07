import { describe, it, expect } from "vitest";
import {
  auditEvent,
  filterEvents,
  matchesQuery,
  toNDJSON,
  parseNDJSON,
  toJSON,
  type AuditEvent,
} from "./index";

const at = (iso: string) => `2026-01-${iso}T00:00:00.000Z`;

const events: AuditEvent[] = [
  auditEvent({ id: "1", at: at("01"), actor: { id: "alice", type: "user" }, action: "login" }),
  auditEvent({ id: "2", at: at("02"), actor: { id: "bob", type: "user" }, action: "updated", target: { type: "order", id: "42" } }),
  auditEvent({ id: "3", at: at("03"), actor: { id: "alice", type: "admin" }, action: "deleted", target: { type: "order", id: "43" } }),
  auditEvent({ id: "4", at: at("04"), actor: { id: "sys", type: "service" }, action: "updated", target: { type: "user", id: "7" } }),
];

describe("filterEvents", () => {
  it("returns all with an empty query and does not mutate input", () => {
    const before = JSON.stringify(events);
    expect(filterEvents(events)).toHaveLength(4);
    expect(filterEvents(events, {})).toHaveLength(4);
    expect(JSON.stringify(events)).toBe(before);
  });

  it("filters by actor id", () => {
    expect(filterEvents(events, { actor: "alice" }).map((e) => e.id)).toEqual(["1", "3"]);
  });

  it("filters by a list of actor ids (OR)", () => {
    expect(filterEvents(events, { actor: ["bob", "sys"] }).map((e) => e.id)).toEqual(["2", "4"]);
  });

  it("filters by actorType", () => {
    expect(filterEvents(events, { actorType: "admin" }).map((e) => e.id)).toEqual(["3"]);
  });

  it("filters by action", () => {
    expect(filterEvents(events, { action: "updated" }).map((e) => e.id)).toEqual(["2", "4"]);
  });

  it("filters by targetType and targetId", () => {
    expect(filterEvents(events, { targetType: "order" }).map((e) => e.id)).toEqual(["2", "3"]);
    expect(filterEvents(events, { targetId: "42" }).map((e) => e.id)).toEqual(["2"]);
  });

  it("filters by an inclusive time range", () => {
    const out = filterEvents(events, { from: at("02"), to: at("03") });
    expect(out.map((e) => e.id)).toEqual(["2", "3"]);
  });

  it("accepts Date and epoch-ms time bounds", () => {
    const out = filterEvents(events, { from: new Date(at("03")) });
    expect(out.map((e) => e.id)).toEqual(["3", "4"]);
    const out2 = filterEvents(events, { to: Date.parse(at("01")) });
    expect(out2.map((e) => e.id)).toEqual(["1"]);
  });

  it("ANDs multiple criteria together", () => {
    const out = filterEvents(events, { actor: "alice", action: "deleted" });
    expect(out.map((e) => e.id)).toEqual(["3"]);
  });

  it("supports a custom where predicate", () => {
    const out = filterEvents(events, { where: (e) => e.target?.type === "user" });
    expect(out.map((e) => e.id)).toEqual(["4"]);
  });

  it("matchesQuery tests a single event", () => {
    expect(matchesQuery(events[1]!, { action: "updated" })).toBe(true);
    expect(matchesQuery(events[1]!, { action: "login" })).toBe(false);
    // a targeted criterion on an event without a target does not match
    expect(matchesQuery(events[0]!, { targetType: "order" })).toBe(false);
  });
});

describe("export helpers", () => {
  it("round-trips through NDJSON", () => {
    const nd = toNDJSON(events);
    expect(nd.split("\n")).toHaveLength(4);
    const back = parseNDJSON<AuditEvent>(nd);
    expect(back).toEqual(events);
  });

  it("parseNDJSON skips blank and trailing lines", () => {
    const nd = toNDJSON(events) + "\n\n  \n";
    expect(parseNDJSON<AuditEvent>(nd)).toEqual(events);
    expect(parseNDJSON("")).toEqual([]);
  });

  it("toJSON produces a parseable array, compact or pretty", () => {
    expect(JSON.parse(toJSON(events))).toEqual(events);
    const pretty = toJSON(events, 2);
    expect(pretty).toContain("\n");
    expect(JSON.parse(pretty)).toEqual(events);
  });
});
