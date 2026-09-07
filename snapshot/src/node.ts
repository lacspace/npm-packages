// Node-only entry point: "@lacspace/snapshot/node".
// This is the ONLY module in the package that touches the filesystem. The core
// serializer and inline matcher (the "." entry) stay isomorphic.
import * as fs from "node:fs";
import * as path from "node:path";

import type { FileSnapshotOptions, FileSnapshotResult } from "./types";
import { serialize } from "./serialize";
import { mismatchMessage } from "./diff";
import { serializeSnapshotFile, parseSnapshotFile } from "./snapfile";

// Re-export the full isomorphic surface so consumers can import everything from /node.
export * from "./index";

/**
 * Error thrown by {@link toMatchSnapshot} when a value does not match its stored
 * `.snap` entry. Carries the structured result on `.result`.
 */
export class FileSnapshotMismatchError extends Error {
  readonly result: FileSnapshotResult;
  constructor(message: string, result: FileSnapshotResult) {
    super(message);
    this.name = "FileSnapshotMismatchError";
    this.result = result;
  }
}

/** Resolve the absolute path of the `.snap` file for a given test file. */
export function snapshotPathFor(file: string): string {
  const dir = path.join(path.dirname(file), "__snapshots__");
  return path.join(dir, `${path.basename(file)}.snap`);
}

function shouldUpdate(explicit: boolean | undefined): boolean {
  if (explicit) return true;
  const env = process.env.UPDATE_SNAPSHOTS;
  return typeof env === "string" && env !== "" && env !== "0" && env.toLowerCase() !== "false";
}

/**
 * Match `value` against a named snapshot stored in a `.snap` file next to `file`.
 *
 * - **First run** (no stored entry): writes it and returns `{ pass: true, created: true }`.
 * - **Subsequent runs**: compares and returns `{ pass: true }` on match.
 * - **Update mode** (`update: true` or the `UPDATE_SNAPSHOTS` env var set):
 *   overwrites the stored entry and returns `{ pass: true, updated: true }`.
 * - **Mismatch**: throws a {@link FileSnapshotMismatchError} carrying a line diff.
 *
 * The `.snap` file is a jest-style CommonJS module of `exports[`name`] = ...`
 * entries, re-parseable by {@link parseSnapshotFile}.
 */
export function toMatchSnapshot(value: unknown, options: FileSnapshotOptions): FileSnapshotResult {
  const { file, name, update, ...serializeOptions } = options;
  if (!file) throw new TypeError("toMatchSnapshot requires options.file (absolute test file path)");
  if (!name) throw new TypeError("toMatchSnapshot requires options.name (snapshot key)");

  const snapshotFile = snapshotPathFor(file);
  const actual = serialize(value, serializeOptions);

  const existing = fs.existsSync(snapshotFile)
    ? parseSnapshotFile(fs.readFileSync(snapshotFile, "utf8"))
    : {};

  const stored = Object.prototype.hasOwnProperty.call(existing, name) ? existing[name]! : null;
  const doUpdate = shouldUpdate(update);

  // Create when missing, or overwrite when updating.
  if (stored === null || doUpdate) {
    const created = stored === null;
    existing[name] = actual;
    writeSnapshotFile(snapshotFile, existing);
    return { pass: true, created, updated: !created, actual, expected: stored, snapshotFile };
  }

  if (stored === actual) {
    return { pass: true, created: false, updated: false, actual, expected: stored, snapshotFile };
  }

  const message = mismatchMessage(
    `Snapshot \`${name}\` did not match (${snapshotFile}).\n` +
      `Run with UPDATE_SNAPSHOTS=1 or { update: true } to update.`,
    stored,
    actual,
  );
  const result: FileSnapshotResult = {
    pass: false,
    created: false,
    updated: false,
    actual,
    expected: stored,
    snapshotFile,
  };
  throw new FileSnapshotMismatchError(message, result);
}

function writeSnapshotFile(snapshotFile: string, snapshots: Record<string, string>): void {
  fs.mkdirSync(path.dirname(snapshotFile), { recursive: true });
  fs.writeFileSync(snapshotFile, serializeSnapshotFile(snapshots), "utf8");
}
