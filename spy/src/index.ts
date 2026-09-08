export type {
  AnyFn,
  Spy,
  SpyResult,
  SpyOnOptions,
  Mocked,
  FakeTimers,
} from "./types";
export type { Matcher } from "./matchers";

export { spy } from "./spy";
export { spyOn, stub } from "./spyOn";
export { mock, mockObject } from "./mock";
export { useFakeTimers } from "./timers";
export { restoreAll, resetAll } from "./registry";
export { deepEqual } from "./equal";
export {
  any,
  anything,
  predicate,
  stringMatching,
  objectContaining,
  arrayContaining,
  isMatcher,
  MATCHER,
} from "./matchers";
