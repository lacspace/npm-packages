/**
 * @lacspace/form — client-side form STATE engine (new in 1.1.0).
 *
 * A tiny, **framework-free**, zero-dependency state machine for interactive
 * forms: values / errors / touched / dirty, sync + async validation, nested
 * paths, field arrays and submit routing. The whole engine is a **pure
 * reducer** plus pure helpers, so it runs and tests under plain Node with no
 * DOM — a thin `createFormStore` wraps it with subscribe/dispatch for use from
 * React (or anything else) without importing React here.
 *
 * ```ts
 * import { createFormStore } from "@lacspace/form";
 *
 * const store = createFormStore({
 *   initialValues: { name: "", tags: [] as string[] },
 *   validate: (v) => (v.name ? {} : { name: "Required" }),
 *   validateOn: ["change", "submit"],
 * });
 *
 * store.setValue("name", "Ada");   // → dirty + (re)validated
 * store.push("tags", "web");        // field-array op
 * await store.handleSubmit((values) => save(values));
 * ```
 */

/* ------------------------------------------------------------------ *
 * Public types
 * ------------------------------------------------------------------ */

/** Flat, dot-path-keyed error map, e.g. `{ "email": "…", "items.0.qty": "…" }`. */
export type FormErrors = Record<string, string>;

/** Flat, dot-path-keyed touched map. */
export type FormTouched = Record<string, boolean>;

/**
 * A validator you inject. Receives the current values and returns a flat
 * error map (empty = valid). May be sync or async — both are supported so you
 * can call out to `@lacspace/validate`, zod, or your own server without this
 * package depending on any of them.
 */
export type FormValidator<V> = (values: V) => FormErrors | Promise<FormErrors>;

/** When validation should run automatically. `"submit"` always runs on submit. */
export type ValidateMode = "change" | "blur" | "submit";

/** The immutable state the reducer owns. */
export interface FormState<V> {
  values: V;
  initialValues: V;
  errors: FormErrors;
  touched: FormTouched;
  isSubmitting: boolean;
  submitCount: number;
}

/** Config for {@link createFormStore}. */
export interface FormConfig<V> {
  initialValues: V;
  /** Injected sync/async validator. Optional — omit for a purely manual form. */
  validate?: FormValidator<V>;
  /** Auto-validate triggers. Default `["submit"]`. */
  validateOn?: ValidateMode | ValidateMode[];
}

/* ------------------------------------------------------------------ *
 * Path helpers — dot + bracket access into nested values
 * ------------------------------------------------------------------ */

/** Parse `"a.b[0].c"` (or `"a.b.0.c"`) into `["a","b",0,"c"]`. */
export function parsePath(path: string): (string | number)[] {
  const out: (string | number)[] = [];
  const re = /[^.[\]]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    const seg = m[0];
    out.push(/^\d+$/.test(seg) ? Number(seg) : seg);
  }
  return out;
}

/** Read a nested value by path. Returns `undefined` for missing branches. */
export function getPath(obj: unknown, path: string | (string | number)[]): unknown {
  const segs = Array.isArray(path) ? path : parsePath(path);
  let cur: unknown = obj;
  for (const key of segs) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur;
}

/**
 * Immutably set a nested value by path, cloning only the touched branch.
 * Missing containers are created (numeric segment → array, otherwise object).
 */
export function setPath<T>(obj: T, path: string | (string | number)[], value: unknown): T {
  const segs = Array.isArray(path) ? path : parsePath(path);
  if (segs.length === 0) return value as T;

  const cloneNode = (node: unknown, key: string | number): Record<string | number, unknown> => {
    if (Array.isArray(node)) return node.slice() as unknown as Record<string | number, unknown>;
    if (node != null && typeof node === "object") return { ...(node as object) } as Record<string | number, unknown>;
    return (typeof key === "number" ? [] : {}) as Record<string | number, unknown>;
  };

  const root = cloneNode(obj, segs[0]!);
  let cur = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const key = segs[i]!;
    const child = cloneNode(cur[key], segs[i + 1]!);
    cur[key] = child;
    cur = child;
  }
  cur[segs[segs.length - 1]!] = value;
  return root as unknown as T;
}

/* ------------------------------------------------------------------ *
 * Index remapping — keep errors/touched aligned with array mutations
 * ------------------------------------------------------------------ */

/**
 * Rewrite the immediate array index in every key under `path` using `map`.
 * A key like `items.2.qty` under `path="items"` has index `2` remapped;
 * `map(i)` returning `null` drops the key entirely.
 */
function remapIndexKeys<T extends string | boolean>(
  record: Record<string, T>,
  path: string,
  map: (i: number) => number | null,
): Record<string, T> {
  const prefix = path + ".";
  const out: Record<string, T> = {};
  for (const key of Object.keys(record)) {
    const val = record[key]!;
    if (!key.startsWith(prefix)) {
      out[key] = val;
      continue;
    }
    const rest = key.slice(prefix.length);
    const m = /^(\d+)(\..*)?$/.exec(rest);
    if (!m) {
      out[key] = val;
      continue;
    }
    const next = map(Number(m[1]));
    if (next === null) continue;
    out[`${prefix}${next}${m[2] ?? ""}`] = val;
  }
  return out;
}

// Index mappers for each array op.
const mapRemove = (i: number) => (j: number): number | null => (j < i ? j : j === i ? null : j - 1);
const mapInsert = (i: number) => (j: number): number | null => (j < i ? j : j + 1);
const mapSwap = (a: number, b: number) => (j: number): number | null => (j === a ? b : j === b ? a : j);
const mapMove = (from: number, to: number) => (j: number): number | null => {
  if (j === from) return to;
  if (from < to) return j > from && j <= to ? j - 1 : j;
  return j >= to && j < from ? j + 1 : j;
};

/* ------------------------------------------------------------------ *
 * Actions + pure reducer
 * ------------------------------------------------------------------ */

export type FormAction<V> =
  | { type: "SET_VALUE"; path: string; value: unknown }
  | { type: "SET_VALUES"; values: V }
  | { type: "PATCH_VALUES"; patch: Partial<V> }
  | { type: "SET_ERROR"; path: string; message: string | undefined }
  | { type: "SET_ERRORS"; errors: FormErrors }
  | { type: "SET_TOUCHED"; path: string; touched?: boolean }
  | { type: "TOUCH_ALL" }
  | { type: "RESET"; values?: V }
  | { type: "RESET_FIELD"; path: string }
  | { type: "SUBMIT_START" }
  | { type: "SUBMIT_END" }
  | { type: "ARRAY_PUSH"; path: string; item: unknown }
  | { type: "ARRAY_REMOVE"; path: string; index: number }
  | { type: "ARRAY_INSERT"; path: string; index: number; item: unknown }
  | { type: "ARRAY_MOVE"; path: string; from: number; to: number }
  | { type: "ARRAY_SWAP"; path: string; a: number; b: number };

/** Build the initial reducer state from starting values. */
export function initFormState<V>(initialValues: V): FormState<V> {
  return {
    values: initialValues,
    initialValues,
    errors: {},
    touched: {},
    isSubmitting: false,
    submitCount: 0,
  };
}

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const out: Record<string, T> = {};
  for (const k of Object.keys(record)) if (k !== key) out[k] = record[k]!;
  return out;
}

/** Drop every key that is `path` or nested under it (`path` + `.` …). */
function omitBranch<T>(record: Record<string, T>, path: string): Record<string, T> {
  const prefix = path + ".";
  const out: Record<string, T> = {};
  for (const k of Object.keys(record)) {
    if (k === path || k.startsWith(prefix)) continue;
    out[k] = record[k]!;
  }
  return out;
}

function currentArray<V>(state: FormState<V>, path: string): unknown[] {
  const arr = getPath(state.values, path);
  return Array.isArray(arr) ? arr : [];
}

/**
 * The pure heart of the engine. Given a state and an action, returns the next
 * state — no side effects, no I/O, no framework. Async validation happens
 * OUTSIDE the reducer; its result is fed back in via `SET_ERRORS`.
 */
export function formReducer<V>(state: FormState<V>, action: FormAction<V>): FormState<V> {
  switch (action.type) {
    case "SET_VALUE":
      return { ...state, values: setPath(state.values, action.path, action.value) };

    case "SET_VALUES":
      return { ...state, values: action.values };

    case "PATCH_VALUES":
      return { ...state, values: { ...(state.values as object), ...(action.patch as object) } as V };

    case "SET_ERROR": {
      const errors =
        action.message == null || action.message === ""
          ? omitKey(state.errors, action.path)
          : { ...state.errors, [action.path]: action.message };
      return { ...state, errors };
    }

    case "SET_ERRORS":
      return { ...state, errors: action.errors };

    case "SET_TOUCHED": {
      const on = action.touched !== false;
      const touched = on
        ? { ...state.touched, [action.path]: true }
        : omitKey(state.touched, action.path);
      return { ...state, touched };
    }

    case "TOUCH_ALL": {
      const touched: FormTouched = { ...state.touched };
      for (const p of leafPaths(state.values)) touched[p] = true;
      return { ...state, touched };
    }

    case "RESET": {
      const initialValues = action.values ?? state.initialValues;
      return initFormState(initialValues);
    }

    case "RESET_FIELD": {
      const initial = getPath(state.initialValues, action.path);
      return {
        ...state,
        values: setPath(state.values, action.path, initial),
        errors: omitBranch(state.errors, action.path),
        touched: omitBranch(state.touched, action.path),
      };
    }

    case "SUBMIT_START":
      return { ...state, isSubmitting: true, submitCount: state.submitCount + 1 };

    case "SUBMIT_END":
      return { ...state, isSubmitting: false };

    case "ARRAY_PUSH": {
      const arr = currentArray(state, action.path);
      return { ...state, values: setPath(state.values, action.path, [...arr, action.item]) };
    }

    case "ARRAY_REMOVE": {
      const arr = currentArray(state, action.path);
      const next = arr.slice();
      next.splice(action.index, 1);
      return {
        ...state,
        values: setPath(state.values, action.path, next),
        errors: remapIndexKeys(state.errors, action.path, mapRemove(action.index)),
        touched: remapIndexKeys(state.touched, action.path, mapRemove(action.index)),
      };
    }

    case "ARRAY_INSERT": {
      const arr = currentArray(state, action.path);
      const next = arr.slice();
      next.splice(action.index, 0, action.item);
      return {
        ...state,
        values: setPath(state.values, action.path, next),
        errors: remapIndexKeys(state.errors, action.path, mapInsert(action.index)),
        touched: remapIndexKeys(state.touched, action.path, mapInsert(action.index)),
      };
    }

    case "ARRAY_MOVE": {
      const arr = currentArray(state, action.path);
      const next = arr.slice();
      const [item] = next.splice(action.from, 1);
      next.splice(action.to, 0, item);
      const map = mapMove(action.from, action.to);
      return {
        ...state,
        values: setPath(state.values, action.path, next),
        errors: remapIndexKeys(state.errors, action.path, map),
        touched: remapIndexKeys(state.touched, action.path, map),
      };
    }

    case "ARRAY_SWAP": {
      const arr = currentArray(state, action.path);
      const next = arr.slice();
      const tmp = next[action.a];
      next[action.a] = next[action.b];
      next[action.b] = tmp;
      const map = mapSwap(action.a, action.b);
      return {
        ...state,
        values: setPath(state.values, action.path, next),
        errors: remapIndexKeys(state.errors, action.path, map),
        touched: remapIndexKeys(state.touched, action.path, map),
      };
    }

    default:
      return state;
  }
}

/* ------------------------------------------------------------------ *
 * Derivations — dirty / valid / leaf paths
 * ------------------------------------------------------------------ */

function isPlainRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

/** Every leaf path in a nested value, e.g. `["name","items.0.qty"]`. */
export function leafPaths(obj: unknown, prefix = ""): string[] {
  if (Array.isArray(obj)) {
    if (obj.length === 0) return prefix ? [prefix] : [];
    return obj.flatMap((item, i) => leafPaths(item, prefix ? `${prefix}.${i}` : String(i)));
  }
  if (isPlainRecord(obj)) {
    const keys = Object.keys(obj);
    if (keys.length === 0) return prefix ? [prefix] : [];
    return keys.flatMap((k) => leafPaths(obj[k], prefix ? `${prefix}.${k}` : k));
  }
  return prefix ? [prefix] : [];
}

/** Structural deep-equality (JSON-shaped values only). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a == null || b == null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (typeof a === "object") {
    const ak = Object.keys(a as object);
    const bk = Object.keys(b as object);
    if (ak.length !== bk.length) return false;
    return ak.every((k) =>
      Object.prototype.hasOwnProperty.call(b, k) &&
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    );
  }
  return false;
}

/**
 * Map of leaf paths whose current value differs from the initial value.
 * `{ name: true, "items.0.qty": true }`.
 */
export function dirtyFields<V>(values: V, initialValues: V): Record<string, boolean> {
  const paths = new Set<string>([...leafPaths(values), ...leafPaths(initialValues)]);
  const out: Record<string, boolean> = {};
  for (const p of paths) {
    if (!deepEqual(getPath(values, p), getPath(initialValues, p))) out[p] = true;
  }
  return out;
}

/** Whether the current values differ from the initial values at all. */
export function isDirty<V>(state: FormState<V>): boolean {
  return !deepEqual(state.values, state.initialValues);
}

/** Whether there are currently zero errors. */
export function isValid<V>(state: FormState<V>): boolean {
  return Object.keys(state.errors).length === 0;
}

/** Convenience read of one field's slice of state. */
export function getFieldState<V>(
  state: FormState<V>,
  path: string,
): { value: unknown; error: string | undefined; touched: boolean; dirty: boolean } {
  return {
    value: getPath(state.values, path),
    error: state.errors[path],
    touched: !!state.touched[path],
    dirty: !deepEqual(getPath(state.values, path), getPath(state.initialValues, path)),
  };
}

/* ------------------------------------------------------------------ *
 * Validation + submit runners — pure, async injected via the validator
 * ------------------------------------------------------------------ */

/** Normalise a `validateOn` config to a lookup set. */
function modeSet(mode: FormConfig<unknown>["validateOn"]): Set<ValidateMode> {
  if (!mode) return new Set(["submit"]);
  return new Set(Array.isArray(mode) ? mode : [mode]);
}

/**
 * Run an injected validator (sync or async) against values and always resolve
 * to a plain error map. No validator → no errors. This is the single async
 * seam of the engine, so tests inject a fake and never touch a real network.
 */
export async function runValidator<V>(values: V, validate?: FormValidator<V>): Promise<FormErrors> {
  if (!validate) return {};
  const r = validate(values);
  const errors = r instanceof Promise ? await r : r;
  return errors ?? {};
}

/** Result of {@link runSubmit}. */
export interface SubmitResult<V> {
  ok: boolean;
  errors: FormErrors;
  values: V;
  /** The resulting state: submit counted, errors applied, all fields touched. */
  state: FormState<V>;
}

/**
 * Pure/async submit orchestration used by {@link createFormStore.handleSubmit}.
 * Marks the submit (count + touch-all), runs the injected validator, applies
 * the errors, and routes to `onValid` or `onInvalid`. `isSubmitting` is `true`
 * on the returned interim states you observe via a store and `false` in the
 * final returned `state`. Fully testable under Node with an injected validator.
 */
export async function runSubmit<V>(
  state: FormState<V>,
  opts: {
    validate?: FormValidator<V>;
    onValid: (values: V) => unknown | Promise<unknown>;
    onInvalid?: (errors: FormErrors, values: V) => unknown | Promise<unknown>;
  },
): Promise<SubmitResult<V>> {
  let next = formReducer(state, { type: "SUBMIT_START" });
  next = formReducer(next, { type: "TOUCH_ALL" });

  const errors = await runValidator(next.values, opts.validate);
  next = formReducer(next, { type: "SET_ERRORS", errors });

  const ok = Object.keys(errors).length === 0;
  if (ok) await opts.onValid(next.values);
  else await opts.onInvalid?.(errors, next.values);

  next = formReducer(next, { type: "SUBMIT_END" });
  return { ok, errors, values: next.values, state: next };
}

/* ------------------------------------------------------------------ *
 * createFormStore — thin, framework-free store over the pure reducer
 * ------------------------------------------------------------------ */

export interface FormStore<V> {
  /** Read the current immutable state. */
  getState(): FormState<V>;
  /** Subscribe to state changes; returns an unsubscribe fn. */
  subscribe(listener: (state: FormState<V>) => void): () => void;
  /** Dispatch a raw reducer action (escape hatch). */
  dispatch(action: FormAction<V>): void;

  setValue(path: string, value: unknown): void;
  /** Alias of {@link setValue} (Formik-style name). */
  setFieldValue(path: string, value: unknown): void;
  setValues(values: V): void;
  patchValues(patch: Partial<V>): void;
  setError(path: string, message: string | undefined): void;
  setErrors(errors: FormErrors): void;
  setTouched(path: string, touched?: boolean): void;
  /** Alias of {@link setTouched}. */
  setFieldTouched(path: string, touched?: boolean): void;
  reset(values?: V): void;
  resetField(path: string): void;

  push(path: string, item: unknown): void;
  remove(path: string, index: number): void;
  insert(path: string, index: number, item: unknown): void;
  move(path: string, from: number, to: number): void;
  swap(path: string, a: number, b: number): void;

  /** Run the injected validator now and store the result. Returns the errors. */
  validate(): Promise<FormErrors>;
  /** Validate, set submitting, and route to `onValid` / `onInvalid`. */
  handleSubmit(
    onValid: (values: V) => unknown | Promise<unknown>,
    onInvalid?: (errors: FormErrors, values: V) => unknown | Promise<unknown>,
  ): Promise<SubmitResult<V>>;

  isValid(): boolean;
  isDirty(): boolean;
  dirtyFields(): Record<string, boolean>;
  getFieldState(path: string): ReturnType<typeof getFieldState<V>>;
}

/**
 * Wrap the pure reducer in a subscribe/dispatch store. No React, no DOM — just
 * a value you can drive from a `useSyncExternalStore`, a test, or any runtime.
 */
export function createFormStore<V>(config: FormConfig<V>): FormStore<V> {
  let state = initFormState(config.initialValues);
  const listeners = new Set<(s: FormState<V>) => void>();
  const modes = modeSet(config.validateOn);

  const emit = () => {
    for (const l of listeners) l(state);
  };
  const dispatch = (action: FormAction<V>) => {
    state = formReducer(state, action);
    emit();
  };

  // Fire-and-forget auto validation; errors land via SET_ERRORS when ready.
  const autoValidate = (trigger: ValidateMode) => {
    if (!config.validate || !modes.has(trigger)) return;
    void runValidator(state.values, config.validate).then((errors) => {
      dispatch({ type: "SET_ERRORS", errors });
    });
  };

  const validate = async (): Promise<FormErrors> => {
    const errors = await runValidator(state.values, config.validate);
    dispatch({ type: "SET_ERRORS", errors });
    return errors;
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch,

    setValue(path, value) {
      dispatch({ type: "SET_VALUE", path, value });
      autoValidate("change");
    },
    setFieldValue(path, value) {
      this.setValue(path, value);
    },
    setValues(values) {
      dispatch({ type: "SET_VALUES", values });
      autoValidate("change");
    },
    patchValues(patch) {
      dispatch({ type: "PATCH_VALUES", patch });
      autoValidate("change");
    },
    setError(path, message) {
      dispatch({ type: "SET_ERROR", path, message });
    },
    setErrors(errors) {
      dispatch({ type: "SET_ERRORS", errors });
    },
    setTouched(path, touched = true) {
      dispatch({ type: "SET_TOUCHED", path, touched });
      if (touched) autoValidate("blur");
    },
    setFieldTouched(path, touched = true) {
      this.setTouched(path, touched);
    },
    reset(values) {
      dispatch({ type: "RESET", values });
    },
    resetField(path) {
      dispatch({ type: "RESET_FIELD", path });
    },

    push(path, item) {
      dispatch({ type: "ARRAY_PUSH", path, item });
    },
    remove(path, index) {
      dispatch({ type: "ARRAY_REMOVE", path, index });
    },
    insert(path, index, item) {
      dispatch({ type: "ARRAY_INSERT", path, index, item });
    },
    move(path, from, to) {
      dispatch({ type: "ARRAY_MOVE", path, from, to });
    },
    swap(path, a, b) {
      dispatch({ type: "ARRAY_SWAP", path, a, b });
    },

    validate,
    async handleSubmit(onValid, onInvalid) {
      dispatch({ type: "SUBMIT_START" });
      dispatch({ type: "TOUCH_ALL" });
      const errors = await runValidator(state.values, config.validate);
      dispatch({ type: "SET_ERRORS", errors });
      const ok = Object.keys(errors).length === 0;
      try {
        if (ok) await onValid(state.values);
        else await onInvalid?.(errors, state.values);
      } finally {
        dispatch({ type: "SUBMIT_END" });
      }
      return { ok, errors, values: state.values, state };
    },

    isValid: () => isValid(state),
    isDirty: () => isDirty(state),
    dirtyFields: () => dirtyFields(state.values, state.initialValues),
    getFieldState: (path) => getFieldState(state, path),
  };
}
