export type {
  AnyFn,
  Spy,
  SpyResult,
  SpyOnOptions,
  Mocked,
  FakeTimers,
} from "./types";

export { spy } from "./spy";
export { spyOn, stub } from "./spyOn";
export { mock, mockObject } from "./mock";
export { useFakeTimers } from "./timers";
export { restoreAll } from "./registry";
export { deepEqual } from "./equal";
