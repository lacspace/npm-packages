import { test, expect } from "vitest";
import { extractBearer } from "./index";

// HTTP header names are case-insensitive (RFC 9110 §5.1). Node lowercases
// req.headers, but a hand-built object or another framework may not, and
// `{ Authorization: "Bearer …" }` used to come back as no token at all.
test("extractBearer reads the Authorization header in any case", () => {
  for (const key of ["authorization", "Authorization", "AUTHORIZATION"]) {
    expect(extractBearer({ [key]: "Bearer a.b.c" })).toBe("a.b.c");
    expect(extractBearer({ headers: { [key]: "Bearer a.b.c" } })).toBe("a.b.c");
  }
});

test("scheme is case-insensitive too, and other schemes are ignored", () => {
  expect(extractBearer({ authorization: "bearer a.b.c" })).toBe("a.b.c");
  expect(extractBearer({ Authorization: "Basic dXNlcjpwdw==" })).toBeUndefined();
});

test("a named cookie is found in any header case", () => {
  expect(extractBearer({ Cookie: "tok=a.b.c" }, { cookieName: "tok" })).toBe("a.b.c");
});
