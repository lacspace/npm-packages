export type {
  SerializeOptions,
  SerializeContext,
  SerializerPlugin,
  InlineSnapshotResult,
  InlineSnapshotOptions,
  FileSnapshotOptions,
  FileSnapshotResult,
} from "./types";

export { serialize } from "./serialize";
export { toMatchInlineSnapshot, SnapshotMismatchError } from "./inline";
export { addSerializer, getSerializers, resetSerializers } from "./registry";
export { lineDiff, mismatchMessage } from "./diff";

// The `.snap` file format helpers are isomorphic (pure string transforms); the
// filesystem `toMatchSnapshot` matcher lives in "@lacspace/snapshot/node".
export { serializeSnapshotFile, parseSnapshotFile } from "./snapfile";

// New in 1.1.0 — all isomorphic, opt-in, and additive.
export type { PropertyMatcher, MatchResult } from "./matchers";
export {
  serializeWithMatchers,
  isMatcher,
  anything,
  any,
  stringMatching,
  stringContaining,
  closeTo,
  arrayContaining,
  objectContaining,
} from "./matchers";

export type { RedactOptions, RedactContext } from "./redact";
export { redact } from "./redact";

export type { ObsoleteReport } from "./obsolete";
export { findObsoleteSnapshots, pruneSnapshots } from "./obsolete";
