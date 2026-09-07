import { test, expect } from "vitest";
import { KeyLists, keyLists } from "./index";

test("allowlisted keys are allowed, never denied", () => {
  const lists = keyLists({ allow: ["10.0.0.1", "svc@internal"] });
  expect(lists.isAllowed("10.0.0.1")).toBe(true);
  expect(lists.isDenied("10.0.0.1")).toBe(false);
  expect(lists.decide("10.0.0.1")).toBe("allow");
  expect(lists.decide("someone-else")).toBe("none");
});

test("denylisted keys are denied", () => {
  const lists = new KeyLists({ deny: ["1.2.3.4"] });
  expect(lists.isDenied("1.2.3.4")).toBe(true);
  expect(lists.isAllowed("1.2.3.4")).toBe(false);
  expect(lists.decide("1.2.3.4")).toBe("deny");
});

test("predicate matchers work for ranges/patterns", () => {
  const lists = keyLists({
    allowMatch: (k) => k.startsWith("10.0."),
    denyMatch: (k) => k.endsWith(".evil"),
  });
  expect(lists.isAllowed("10.0.9.9")).toBe(true);
  expect(lists.isDenied("bot.evil")).toBe(true);
  expect(lists.decide("10.0.9.9")).toBe("allow");
  expect(lists.decide("bot.evil")).toBe("deny");
  expect(lists.decide("plain")).toBe("none");
});

test("both-lists conflict resolves to allow by default, deny when configured", () => {
  const dflt = keyLists({ allow: ["x"], deny: ["x"] });
  expect(dflt.decide("x")).toBe("allow");
  const denyWins = keyLists({ allow: ["x"], deny: ["x"], conflict: "deny" });
  expect(denyWins.decide("x")).toBe("deny");
});

test("addAllow/addDeny mutate and chain", () => {
  const lists = keyLists();
  expect(lists.decide("k")).toBe("none");
  lists.addAllow("k").addDeny("bad");
  expect(lists.decide("k")).toBe("allow");
  expect(lists.decide("bad")).toBe("deny");
});
