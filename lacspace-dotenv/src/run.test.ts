import { describe, it, expect } from "vitest";
import { mergeEnv } from "./run.js";

describe("mergeEnv", () => {
  it("merges files with later files winning and file values over base", () => {
    const env = mergeEnv(
      [{ A: "1", B: "1" }, { B: "2", C: "2" }],
      { A: "base", D: "base", UNDEF: undefined },
    );
    expect(env.A).toBe("1"); // file overrides base
    expect(env.B).toBe("2"); // later file wins
    expect(env.C).toBe("2");
    expect(env.D).toBe("base"); // base-only key preserved
    expect("UNDEF" in env).toBe(false); // undefined base values dropped
  });

  it("keeps base values when override is false", () => {
    const env = mergeEnv([{ A: "file" }], { A: "base" }, { override: false });
    expect(env.A).toBe("base");
  });

  it("expands ${refs} in the merged environment when asked", () => {
    const env = mergeEnv(
      [{ HOST: "localhost", URL: "http://${HOST}:${PORT}" }],
      { PORT: "3000" },
      { expand: true },
    );
    expect(env.URL).toBe("http://localhost:3000");
  });
});
