import { test, expect } from "vitest";
import {
  createEnv,
  parseEnv,
  safeParse,
  generateEnvExample,
  expandEnv,
  EnvError,
  str,
  num,
  port,
  url,
  bool,
} from "./index";

test("parseEnv returns success shape with typed data (no throw)", () => {
  const res = parseEnv({ PORT: port({ default: 3000 }) }, {});
  expect(res.success).toBe(true);
  if (res.success) expect(res.data.PORT).toBe(3000);
});

test("parseEnv returns failure shape with aggregated errors (no throw)", () => {
  const res = parseEnv({ A: str(), B: num() }, {});
  expect(res.success).toBe(false);
  if (!res.success) {
    expect(res.errors.length).toBe(2);
    expect(res.error).toBeInstanceOf(EnvError);
  }
  expect(safeParse).toBe(parseEnv);
});

test("secret-looking var values are redacted in aggregated errors", () => {
  let err: EnvError | undefined;
  try {
    createEnv({ API_KEY: url(), COUNT: num() }, { API_KEY: "supersecretvalue", COUNT: "abc" });
  } catch (e) {
    err = e as EnvError;
  }
  expect(err).toBeInstanceOf(EnvError);
  expect(err!.message).not.toContain("supersecretvalue");
  expect(err!.message).toContain("«redacted»");
  // Non-secret var values are NOT redacted.
  expect(err!.message).toContain("abc");
});

test(".secret() marks an otherwise-innocent key for redaction", () => {
  let err: EnvError | undefined;
  try {
    createEnv({ HANDSHAKE: url().secret!() }, { HANDSHAKE: "leakme" });
  } catch (e) {
    err = e as EnvError;
  }
  expect(err!.message).not.toContain("leakme");
  expect(err!.message).toContain("«redacted»");
});

test("required / default / optional precedence", () => {
  // default wins when unset
  expect(createEnv({ X: str({ default: "d" }) }, {}).X).toBe("d");
  // set value wins over default
  expect(createEnv({ X: str({ default: "d" }) }, { X: "set" }).X).toBe("set");
  // optional → undefined when unset
  expect(createEnv({ X: str({ optional: true }) }, {}).X).toBeUndefined();
  // required → throws when unset
  expect(() => createEnv({ X: str() }, {})).toThrow(EnvError);
});

test("expandEnv resolves ${VAR} chains", () => {
  const out = expandEnv({
    HOST: "db.local",
    PORT: "5432",
    DATABASE_URL: "postgres://${HOST}:${PORT}/app",
  });
  expect(out.DATABASE_URL).toBe("postgres://db.local:5432/app");
});

test("expandEnv supports ${VAR:-fallback} for missing refs", () => {
  const out = expandEnv({ URL: "http://${MISSING:-localhost}/x" });
  expect(out.URL).toBe("http://localhost/x");
});

test("expandEnv detects cyclic references", () => {
  expect(() => expandEnv({ A: "${B}", B: "${A}" })).toThrow(/[Cc]yclic/);
});

test("createEnv with { expand:true } expands before validation", () => {
  const env = createEnv(
    { BASE: url(), API: url() },
    { BASE: "https://api.example.com", API: "${BASE}/v1" },
    { expand: true },
  );
  expect(env.API).toBe("https://api.example.com/v1");
  // Off by default: literal value fails URL validation.
  expect(() => createEnv({ API: url() }, { API: "${BASE}/v1" })).toThrow();
});

test("generateEnvExample renders comments, type/required notes and defaults", () => {
  const schema = {
    PORT: port({ default: 3000 }).describe!("HTTP port"),
    DATABASE_URL: url().example!("postgres://localhost/app"),
    DEBUG: bool({ optional: true }),
  };
  const example = generateEnvExample(schema, { header: "App config" });
  expect(example).toContain("# App config");
  expect(example).toContain("# HTTP port");
  expect(example).toContain("PORT=3000");
  expect(example).toContain("DATABASE_URL=postgres://localhost/app");
  expect(example).toContain("# (port, optional)");
  expect(example).toContain("DEBUG=");
});
