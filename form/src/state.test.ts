import { test, expect } from "vitest";
import {
  parsePath,
  getPath,
  setPath,
  initFormState,
  formReducer,
  leafPaths,
  deepEqual,
  dirtyFields,
  isDirty,
  isValid,
  getFieldState,
  runValidator,
  runSubmit,
  createFormStore,
  type FormValidator,
  type FormErrors,
} from "./state";

/* ---------- path helpers ---------- */

test("parsePath handles dot + bracket notation", () => {
  expect(parsePath("a.b[0].c")).toEqual(["a", "b", 0, "c"]);
  expect(parsePath("items.2.qty")).toEqual(["items", 2, "qty"]);
});

test("getPath reads nested values and returns undefined for missing branches", () => {
  const o = { a: { b: [{ c: 5 }] } };
  expect(getPath(o, "a.b[0].c")).toBe(5);
  expect(getPath(o, "a.x.y")).toBeUndefined();
});

test("setPath immutably sets nested values without mutating the source", () => {
  const o = { a: { b: 1 }, keep: [1, 2] };
  const n = setPath(o, "a.b", 9);
  expect(n).toEqual({ a: { b: 9 }, keep: [1, 2] });
  expect(o.a.b).toBe(1); // original untouched
  expect(n.keep).toBe(o.keep); // untouched branch shared
});

test("setPath creates arrays for numeric segments", () => {
  const n = setPath({} as Record<string, unknown>, "items.0.name", "x");
  expect(n).toEqual({ items: [{ name: "x" }] });
});

/* ---------- reducer: value / dirty / touched ---------- */

test("SET_VALUE updates values and marks the field dirty", () => {
  const s0 = initFormState({ name: "", age: 0 });
  const s1 = formReducer(s0, { type: "SET_VALUE", path: "name", value: "Ada" });
  expect(s1.values.name).toBe("Ada");
  expect(getFieldState(s1, "name").dirty).toBe(true);
  expect(getFieldState(s1, "age").dirty).toBe(false);
  expect(isDirty(s1)).toBe(true);
});

test("SET_TOUCHED toggles touched on and off", () => {
  const s0 = initFormState({ name: "" });
  const on = formReducer(s0, { type: "SET_TOUCHED", path: "name" });
  expect(on.touched.name).toBe(true);
  const off = formReducer(on, { type: "SET_TOUCHED", path: "name", touched: false });
  expect(off.touched.name).toBeUndefined();
});

test("SET_ERROR sets and clears a field error", () => {
  const s0 = initFormState({ name: "" });
  const withErr = formReducer(s0, { type: "SET_ERROR", path: "name", message: "Required" });
  expect(withErr.errors.name).toBe("Required");
  expect(isValid(withErr)).toBe(false);
  const cleared = formReducer(withErr, { type: "SET_ERROR", path: "name", message: undefined });
  expect(cleared.errors.name).toBeUndefined();
  expect(isValid(cleared)).toBe(true);
});

test("TOUCH_ALL marks every leaf touched", () => {
  const s0 = initFormState({ name: "", nested: { a: 1 }, tags: ["x"] });
  const s1 = formReducer(s0, { type: "TOUCH_ALL" });
  expect(s1.touched["name"]).toBe(true);
  expect(s1.touched["nested.a"]).toBe(true);
  expect(s1.touched["tags.0"]).toBe(true);
});

test("RESET restores initial values and clears errors/touched/submit", () => {
  let s = initFormState({ name: "" });
  s = formReducer(s, { type: "SET_VALUE", path: "name", value: "x" });
  s = formReducer(s, { type: "SET_ERROR", path: "name", message: "e" });
  s = formReducer(s, { type: "SUBMIT_START" });
  const r = formReducer(s, { type: "RESET" });
  expect(r.values.name).toBe("");
  expect(r.errors).toEqual({});
  expect(r.submitCount).toBe(0);
  expect(r.isSubmitting).toBe(false);
});

test("RESET_FIELD restores one field and drops its error/touched branch", () => {
  let s = initFormState({ name: "orig", other: "keep" });
  s = formReducer(s, { type: "SET_VALUE", path: "name", value: "changed" });
  s = formReducer(s, { type: "SET_ERROR", path: "name", message: "e" });
  s = formReducer(s, { type: "SET_TOUCHED", path: "name" });
  s = formReducer(s, { type: "SET_VALUE", path: "other", value: "kept-change" });
  const r = formReducer(s, { type: "RESET_FIELD", path: "name" });
  expect(r.values.name).toBe("orig");
  expect(r.errors.name).toBeUndefined();
  expect(r.touched.name).toBeUndefined();
  expect(r.values.other).toBe("kept-change"); // other field left alone
});

test("SUBMIT_START increments submitCount and sets submitting; SUBMIT_END clears it", () => {
  const s0 = initFormState({ name: "" });
  const start = formReducer(s0, { type: "SUBMIT_START" });
  expect(start.isSubmitting).toBe(true);
  expect(start.submitCount).toBe(1);
  const end = formReducer(start, { type: "SUBMIT_END" });
  expect(end.isSubmitting).toBe(false);
  expect(end.submitCount).toBe(1);
});

/* ---------- field arrays keep errors/touched aligned ---------- */

function seededArrayState() {
  let s = initFormState({ items: ["a", "b", "c", "d"] as string[] });
  // errors/touched pinned to each index so we can prove alignment
  s = formReducer(s, { type: "SET_ERROR", path: "items.0", message: "e0" });
  s = formReducer(s, { type: "SET_ERROR", path: "items.1", message: "e1" });
  s = formReducer(s, { type: "SET_ERROR", path: "items.2", message: "e2" });
  s = formReducer(s, { type: "SET_ERROR", path: "items.3", message: "e3" });
  s = formReducer(s, { type: "SET_TOUCHED", path: "items.2" });
  return s;
}

test("ARRAY_PUSH appends to the array", () => {
  const s = formReducer(initFormState({ items: ["a"] as string[] }), {
    type: "ARRAY_PUSH",
    path: "items",
    item: "b",
  });
  expect(s.values.items).toEqual(["a", "b"]);
});

test("ARRAY_REMOVE removes item and shifts error/touched keys down", () => {
  const s = formReducer(seededArrayState(), { type: "ARRAY_REMOVE", path: "items", index: 1 });
  expect(s.values.items).toEqual(["a", "c", "d"]);
  expect(s.errors["items.0"]).toBe("e0"); // unchanged
  expect(s.errors["items.1"]).toBe("e2"); // was index 2
  expect(s.errors["items.2"]).toBe("e3"); // was index 3
  expect(s.errors["items.3"]).toBeUndefined();
  expect(s.touched["items.1"]).toBe(true); // touched followed item c from idx2→1
});

test("ARRAY_INSERT inserts item and shifts error/touched keys up", () => {
  const s = formReducer(seededArrayState(), { type: "ARRAY_INSERT", path: "items", index: 1, item: "NEW" });
  expect(s.values.items).toEqual(["a", "NEW", "b", "c", "d"]);
  expect(s.errors["items.0"]).toBe("e0");
  expect(s.errors["items.1"]).toBeUndefined(); // freshly inserted slot has no error
  expect(s.errors["items.2"]).toBe("e1"); // b shifted 1→2
  expect(s.touched["items.3"]).toBe(true); // c shifted 2→3
});

test("ARRAY_MOVE moves item and remaps error/touched keys", () => {
  const s = formReducer(seededArrayState(), { type: "ARRAY_MOVE", path: "items", from: 0, to: 2 });
  expect(s.values.items).toEqual(["b", "c", "a", "d"]);
  expect(s.errors["items.2"]).toBe("e0"); // a moved 0→2
  expect(s.errors["items.0"]).toBe("e1"); // b 1→0
  expect(s.errors["items.1"]).toBe("e2"); // c 2→1
  expect(s.touched["items.1"]).toBe(true); // touched followed c
});

test("ARRAY_SWAP swaps items and their error/touched keys", () => {
  const s = formReducer(seededArrayState(), { type: "ARRAY_SWAP", path: "items", a: 0, b: 2 });
  expect(s.values.items).toEqual(["c", "b", "a", "d"]);
  expect(s.errors["items.0"]).toBe("e2");
  expect(s.errors["items.2"]).toBe("e0");
  expect(s.touched["items.0"]).toBe(true); // touched swapped from idx2 to idx0
  expect(s.touched["items.2"]).toBeUndefined();
});

test("nested object-array errors realign on remove", () => {
  let s = initFormState({ rows: [{ q: 1 }, { q: 2 }, { q: 3 }] });
  s = formReducer(s, { type: "SET_ERROR", path: "rows.2.q", message: "bad" });
  s = formReducer(s, { type: "ARRAY_REMOVE", path: "rows", index: 0 });
  expect(s.values.rows).toEqual([{ q: 2 }, { q: 3 }]);
  expect(s.errors["rows.1.q"]).toBe("bad"); // rows.2.q → rows.1.q
});

/* ---------- validation runner (sync + async, injected) ---------- */

test("runValidator returns {} when no validator is injected", async () => {
  expect(await runValidator({ a: 1 })).toEqual({});
});

test("runValidator supports a synchronous injected validator", async () => {
  const validate: FormValidator<{ name: string }> = (v): FormErrors => (v.name ? {} : { name: "Required" });
  expect(await runValidator({ name: "" }, validate)).toEqual({ name: "Required" });
  expect(await runValidator({ name: "Ada" }, validate)).toEqual({});
});

test("runValidator awaits an asynchronous injected validator", async () => {
  const validate: FormValidator<{ email: string }> = async (v): Promise<FormErrors> => {
    await Promise.resolve();
    return v.email.includes("@") ? {} : { email: "Invalid" };
  };
  expect(await runValidator({ email: "no" }, validate)).toEqual({ email: "Invalid" });
  expect(await runValidator({ email: "a@b.co" }, validate)).toEqual({});
});

/* ---------- handleSubmit routing (async, injected) ---------- */

test("runSubmit routes to onValid when the injected validator passes", async () => {
  const s = formReducer(initFormState({ name: "Ada" }), { type: "SET_VALUE", path: "name", value: "Ada" });
  let validPayload: unknown = null;
  let invalidCalled = false;
  const res = await runSubmit(s, {
    validate: async () => ({}),
    onValid: (values) => {
      validPayload = values;
    },
    onInvalid: () => {
      invalidCalled = true;
    },
  });
  expect(res.ok).toBe(true);
  expect(validPayload).toEqual({ name: "Ada" });
  expect(invalidCalled).toBe(false);
  expect(res.state.submitCount).toBe(1);
  expect(res.state.isSubmitting).toBe(false);
});

test("runSubmit routes to onInvalid and touches all when validation fails", async () => {
  const s = initFormState({ name: "", email: "" });
  let invalidErrors: Record<string, string> | null = null;
  let validCalled = false;
  const res = await runSubmit(s, {
    validate: async () => ({ name: "Required", email: "Required" }),
    onValid: () => {
      validCalled = true;
    },
    onInvalid: (errors) => {
      invalidErrors = errors;
    },
  });
  expect(res.ok).toBe(false);
  expect(validCalled).toBe(false);
  expect(invalidErrors).toEqual({ name: "Required", email: "Required" });
  expect(res.state.touched["name"]).toBe(true); // all fields touched on submit
  expect(res.state.touched["email"]).toBe(true);
});

/* ---------- dirty diff ---------- */

test("dirtyFields reports only the leaf paths that changed", () => {
  const initial = { name: "a", nested: { x: 1, y: 2 }, tags: ["p"] };
  const values = { name: "a", nested: { x: 9, y: 2 }, tags: ["p", "q"] };
  expect(dirtyFields(values, initial)).toEqual({ "nested.x": true, "tags.1": true });
});

test("deepEqual + leafPaths behave structurally", () => {
  expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
  expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
  expect(leafPaths({ a: 1, b: { c: 2 }, d: [] }).sort()).toEqual(["a", "b.c", "d"]);
});

/* ---------- store integration (framework-free, node) ---------- */

test("createFormStore drives the reducer and notifies subscribers", () => {
  const store = createFormStore({ initialValues: { name: "" } });
  const seen: string[] = [];
  const unsub = store.subscribe((s) => seen.push(String(s.values.name)));
  store.setValue("name", "Grace");
  expect(store.getState().values.name).toBe("Grace");
  expect(store.isDirty()).toBe(true);
  expect(seen).toContain("Grace");
  unsub();
  store.setValue("name", "after");
  expect(seen).not.toContain("after"); // unsubscribed
});

test("store auto-validates on change when configured", async () => {
  const store = createFormStore({
    initialValues: { name: "" },
    validate: (v): FormErrors => (v.name ? {} : { name: "Required" }),
    validateOn: ["change"],
  });
  store.setValue("name", "");
  await Promise.resolve(); // let the fire-and-forget validation settle
  await Promise.resolve();
  expect(store.getState().errors.name).toBe("Required");
  store.setValue("name", "Ada");
  await Promise.resolve();
  await Promise.resolve();
  expect(store.isValid()).toBe(true);
});

test("store.handleSubmit sets submitting during the run and routes correctly", async () => {
  const store = createFormStore({
    initialValues: { name: "" },
    validate: async (v): Promise<FormErrors> => (v.name ? {} : { name: "Required" }),
  });
  let submittingDuringValid = false;
  store.setValue("name", "Ada");
  const res = await store.handleSubmit(() => {
    submittingDuringValid = store.getState().isSubmitting;
  });
  expect(res.ok).toBe(true);
  expect(submittingDuringValid).toBe(true);
  expect(store.getState().isSubmitting).toBe(false);
  expect(store.getState().submitCount).toBe(1);
});

test("store field-array helpers keep values and errors aligned", () => {
  const store = createFormStore({ initialValues: { tags: ["a", "b", "c"] as string[] } });
  store.setError("tags.2", "e2");
  store.remove("tags", 0);
  expect(store.getState().values.tags).toEqual(["b", "c"]);
  expect(store.getState().errors["tags.1"]).toBe("e2");
});
