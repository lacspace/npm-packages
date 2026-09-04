import { test, expect } from "vitest";
import { handleForm, createForm, formDataToObject, type Validator } from "./index";

// A tiny structural schema compatible with the Validator contract.
function objectSchema<T extends Record<string, unknown>>(
  required: string[],
): Validator<T> {
  return {
    safeParse(input) {
      const obj = input as Record<string, unknown>;
      const errors: Record<string, string> = {};
      for (const k of required) {
        if (obj[k] === undefined || obj[k] === "") errors[k] = `${k} is required`;
      }
      if (Object.keys(errors).length) {
        return { success: false, error: { flatten: () => errors } };
      }
      return { success: true, data: obj as T };
    },
  };
}

test("handleForm parses FormData into a typed object", () => {
  const fd = new FormData();
  fd.append("name", "Ada");
  fd.append("email", "ada@example.com");
  const r = handleForm(fd, { schema: objectSchema(["name", "email"]) });
  expect(r.ok).toBe(true);
  if (r.ok) {
    expect(r.data.name).toBe("Ada");
    expect(r.data.email).toBe("ada@example.com");
  }
});

test("createForm().action parses a FormData submission", () => {
  const form = createForm({ schema: objectSchema(["name"]) });
  const fd = new FormData();
  fd.append("name", "Grace");
  const r = form.action(undefined, fd);
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.data.name).toBe("Grace");
});

test("a filled honeypot field is rejected as spam", () => {
  const r = handleForm(
    { name: "Bot", company: "definitely-a-bot" },
    { schema: objectSchema(["name"]), honeypot: "company" },
  );
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.spam).toBe(true);
});

test("requireTimestamp rejects a missing/empty _ts (with minSubmitMs)", () => {
  const opts = {
    schema: objectSchema(["name"]),
    minSubmitMs: 1000,
    requireTimestamp: true,
  };
  const rejected = handleForm({ name: "Ada" }, opts); // no _ts
  expect(rejected.ok).toBe(false);
  if (!rejected.ok) expect(rejected.spam).toBe(true);

  const rejectedEmpty = handleForm({ name: "Ada", _ts: "" }, opts);
  expect(rejectedEmpty.ok).toBe(false);
});

test("default (no requireTimestamp) still passes without _ts", () => {
  const r = handleForm(
    { name: "Ada" },
    { schema: objectSchema(["name"]), minSubmitMs: 1000 },
  );
  expect(r.ok).toBe(true);
});

test("a plausible (old-enough) timestamp passes", () => {
  const r = handleForm(
    { name: "Ada", _ts: String(Date.now() - 5000) },
    { schema: objectSchema(["name"]), minSubmitMs: 1000, requireTimestamp: true },
  );
  expect(r.ok).toBe(true);
});

test("repeated keys fold into arrays", () => {
  const fd = new FormData();
  fd.append("tag", "a");
  fd.append("tag", "b");
  fd.append("tag", "c");
  const obj = formDataToObject(fd);
  expect(obj.tag).toEqual(["a", "b", "c"]);
});
