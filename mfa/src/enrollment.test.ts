import { test, expect } from "vitest";
import {
  beginEnrollment,
  challengeEnrollment,
  completeEnrollment,
  type Factor,
} from "./index";

const totp: Factor = { id: "totp", type: "possession" };

test("enrollment moves started → challenged → confirmed and yields a record", () => {
  let clock = 1_000;
  const now = () => clock;

  const started = beginEnrollment(totp, { now });
  expect(started.status).toBe("started");
  expect(started.startedAt).toBe(1_000);

  clock = 2_000;
  const challenged = challengeEnrollment(started, "SECRET-XYZ", { now });
  expect(challenged.status).toBe("challenged");
  expect(challenged.challenge).toBe("SECRET-XYZ");
  expect(challenged.updatedAt).toBe(2_000);

  clock = 3_000;
  const { state, record } = completeEnrollment(challenged, true, { now });
  expect(state.status).toBe("confirmed");
  expect(record).toBeDefined();
  expect(record!.factorId).toBe("totp");
  expect(record!.type).toBe("possession");
  expect(record!.secret).toBe("SECRET-XYZ");
  expect(record!.enrolledAt).toBe(3_000);
});

test("completeEnrollment with verified=false yields failed and no record", () => {
  const challenged = challengeEnrollment(beginEnrollment(totp), "s");
  const { state, record } = completeEnrollment(challenged, false);
  expect(state.status).toBe("failed");
  expect(record).toBeUndefined();
});

test("completeEnrollment can override the persisted secret", () => {
  const challenged = challengeEnrollment(beginEnrollment(totp), "shown-to-user");
  const { record } = completeEnrollment(challenged, true, { secret: "canonical-secret" });
  expect(record!.secret).toBe("canonical-secret");
});

test("out-of-order transitions throw", () => {
  const started = beginEnrollment(totp);
  expect(() => completeEnrollment(started, true)).toThrow();
  const challenged = challengeEnrollment(started, "s");
  expect(() => challengeEnrollment(challenged, "s2")).toThrow();
});
