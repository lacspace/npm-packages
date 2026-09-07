import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  toMatchSnapshot,
  snapshotPathFor,
  FileSnapshotMismatchError,
  parseSnapshotFile,
} from "./node";

let dir: string;
let fakeTestFile: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "lacspace-snapshot-"));
  fakeTestFile = path.join(dir, "example.test.ts");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.UPDATE_SNAPSHOTS;
});

describe("toMatchSnapshot — filesystem", () => {
  it("creates the snapshot on first run", () => {
    const r = toMatchSnapshot({ a: 1 }, { file: fakeTestFile, name: "first" });
    expect(r.created).toBe(true);
    expect(r.pass).toBe(true);
    expect(r.expected).toBeNull();
    expect(fs.existsSync(r.snapshotFile)).toBe(true);
    expect(r.snapshotFile).toBe(snapshotPathFor(fakeTestFile));
    expect(r.snapshotFile).toContain("__snapshots__");
    expect(r.snapshotFile.endsWith("example.test.ts.snap")).toBe(true);
  });

  it("matches on the second run", () => {
    toMatchSnapshot({ a: 1, b: 2 }, { file: fakeTestFile, name: "same" });
    const r = toMatchSnapshot({ b: 2, a: 1 }, { file: fakeTestFile, name: "same" });
    expect(r.pass).toBe(true);
    expect(r.created).toBe(false);
    expect(r.updated).toBe(false);
  });

  it("throws a descriptive diff on mismatch", () => {
    toMatchSnapshot({ a: 1 }, { file: fakeTestFile, name: "drift" });
    let err: unknown;
    try {
      toMatchSnapshot({ a: 2 }, { file: fakeTestFile, name: "drift" });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(FileSnapshotMismatchError);
    expect((err as FileSnapshotMismatchError).message).toContain("did not match");
    expect((err as FileSnapshotMismatchError).message).toContain("+ Received");
    expect((err as FileSnapshotMismatchError).result.pass).toBe(false);
  });

  it("updates when { update: true }", () => {
    toMatchSnapshot({ a: 1 }, { file: fakeTestFile, name: "up" });
    const r = toMatchSnapshot({ a: 999 }, { file: fakeTestFile, name: "up", update: true });
    expect(r.updated).toBe(true);
    expect(r.pass).toBe(true);
    // Now the new value is stored and matches.
    const again = toMatchSnapshot({ a: 999 }, { file: fakeTestFile, name: "up" });
    expect(again.pass).toBe(true);
    expect(again.created).toBe(false);
  });

  it("updates when UPDATE_SNAPSHOTS env is set", () => {
    toMatchSnapshot("old", { file: fakeTestFile, name: "env" });
    process.env.UPDATE_SNAPSHOTS = "1";
    const r = toMatchSnapshot("new", { file: fakeTestFile, name: "env" });
    expect(r.updated).toBe(true);
    const stored = parseSnapshotFile(fs.readFileSync(r.snapshotFile, "utf8"));
    expect(stored.env).toBe('"new"');
  });

  it("keeps multiple named snapshots in one file", () => {
    toMatchSnapshot(1, { file: fakeTestFile, name: "one" });
    toMatchSnapshot(2, { file: fakeTestFile, name: "two" });
    const snapFile = snapshotPathFor(fakeTestFile);
    const stored = parseSnapshotFile(fs.readFileSync(snapFile, "utf8"));
    expect(Object.keys(stored).sort()).toEqual(["one", "two"]);
    expect(stored.one).toBe("1");
    expect(stored.two).toBe("2");
  });

  it("round-trips a complex value through the file", () => {
    const value = {
      when: new Date("2021-05-06T07:08:09.000Z"),
      set: new Set([3, 1, 2]),
      re: /x/g,
      nested: { deep: [1, { k: "v" }] },
    };
    toMatchSnapshot(value, { file: fakeTestFile, name: "complex" });
    const r = toMatchSnapshot(value, { file: fakeTestFile, name: "complex" });
    expect(r.pass).toBe(true);
  });

  it("requires file and name", () => {
    // @ts-expect-error missing name
    expect(() => toMatchSnapshot(1, { file: fakeTestFile })).toThrow(TypeError);
    // @ts-expect-error missing file
    expect(() => toMatchSnapshot(1, { name: "x" })).toThrow(TypeError);
  });

  it("re-exports the isomorphic surface from /node", async () => {
    const mod = await import("./node");
    expect(typeof mod.serialize).toBe("function");
    expect(typeof mod.toMatchInlineSnapshot).toBe("function");
    expect(typeof mod.addSerializer).toBe("function");
  });
});
