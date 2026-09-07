/**
 * Options that control how {@link serialize} renders a value.
 */
export interface SerializeOptions {
  /** Number of spaces per indent level. Default `2`. */
  indent?: number;
  /**
   * Maximum nesting depth to expand. Values deeper than this are collapsed to a
   * short label such as `[Object]` or `[Array]`. Default `Infinity` (no limit).
   */
  maxDepth?: number;
  /**
   * When `true` (default), functions render as `[Function name]`. When `false`
   * every function renders as `[Function]` so snapshots stay stable across renames.
   */
  printFunctionNames?: boolean;
  /**
   * Custom plugin serializers, tried before the built-in rules (most recently
   * added wins). Global plugins registered with {@link addSerializer} are also
   * applied, after the ones passed here.
   */
  serializers?: SerializerPlugin[];
}

/**
 * Context handed to a {@link SerializerPlugin.serialize} implementation.
 */
export interface SerializeContext {
  /** One indent unit (e.g. `"  "`). */
  indent: string;
  /** The indentation prefix for the current line/level. */
  indentation: string;
  /** Current nesting depth (top-level value is `0`). */
  depth: number;
  /** Serialize a child value one level deeper, respecting indentation and cycles. */
  print(value: unknown): string;
}

/**
 * A jest-snapshot-style plugin: `test` decides whether it applies, `serialize`
 * produces the string for a matching value.
 */
export interface SerializerPlugin {
  /** Return `true` if this plugin should handle `value`. */
  test(value: unknown): boolean;
  /** Produce the serialized string for `value`. */
  serialize(value: unknown, ctx: SerializeContext): string;
}

/** Result returned by {@link toMatchInlineSnapshot}. */
export interface InlineSnapshotResult {
  /** Whether the produced snapshot matched `expected`. `true` when `expected` is omitted. */
  pass: boolean;
  /** The freshly serialized value. */
  actual: string;
  /** The expected snapshot, or `null` when none was provided. */
  expected: string | null;
  /** A human-readable message (the diff on mismatch, or the paste-ready snapshot). */
  message: string;
}

/** Options for {@link toMatchInlineSnapshot}. */
export interface InlineSnapshotOptions extends SerializeOptions {
  /**
   * When `true` (default) a mismatch throws. Set `false` to always return the
   * {@link InlineSnapshotResult} instead so you can assert on `pass` yourself.
   */
  throwOnMismatch?: boolean;
}

/** Options for the Node-only `toMatchSnapshot` file matcher. */
export interface FileSnapshotOptions extends SerializeOptions {
  /**
   * Absolute path of the test file. The `.snap` file is written to a
   * `__snapshots__` directory next to it, named `<basename>.snap`.
   */
  file: string;
  /** Unique key for this snapshot within the file. */
  name: string;
  /**
   * Force-write the snapshot. Also triggered by the `UPDATE_SNAPSHOTS`
   * environment variable being set to any non-empty value.
   */
  update?: boolean;
}

/** Result returned by the Node-only `toMatchSnapshot`. */
export interface FileSnapshotResult {
  /** Whether the value matched the stored snapshot. */
  pass: boolean;
  /** `true` when the snapshot file entry was created on this run. */
  created: boolean;
  /** `true` when the snapshot file entry was overwritten on this run. */
  updated: boolean;
  /** The freshly serialized value. */
  actual: string;
  /** The stored snapshot, or `null` when it did not exist yet. */
  expected: string | null;
  /** Absolute path of the `.snap` file. */
  snapshotFile: string;
}
