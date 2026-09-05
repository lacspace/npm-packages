import { test, expect } from "vitest";
import {
  VERIFICATION_PROVIDERS,
  verificationMeta,
  allVerifications,
  nextVerification,
  verificationTag,
} from "./index";

test("registry includes new engines", () => {
  expect(VERIFICATION_PROVIDERS.naver).toBe("naver-site-verification");
  expect(VERIFICATION_PROVIDERS.brave).toBe("brave-site-verification");
  expect(VERIFICATION_PROVIDERS.alexa).toBe("alexaVerifyID");
  // Existing ones untouched.
  expect(VERIFICATION_PROVIDERS.google).toBe("google-site-verification");
  expect(VERIFICATION_PROVIDERS.bing).toBe("msvalidate.01");
});

test("existing verificationMeta still works and now covers new engines", () => {
  expect(verificationMeta({ google: "abc" })).toEqual([
    { name: "google-site-verification", content: "abc" },
  ]);
  expect(verificationMeta({ naver: "n1", brave: "b1" })).toEqual([
    { name: "naver-site-verification", content: "n1" },
    { name: "brave-site-verification", content: "b1" },
  ]);
});

test("allVerifications resolves provider ids and passes raw names through", () => {
  expect(
    allVerifications({ google: "abc", bing: "xyz", "custom-verify": "t", empty: "" }),
  ).toEqual([
    { name: "google-site-verification", content: "abc" },
    { name: "msvalidate.01", content: "xyz" },
    { name: "custom-verify", content: "t" },
  ]);
});

test("nextVerification builds a Next.js verification shape", () => {
  expect(nextVerification({ google: "abc", bing: "xyz", yandex: "y1" })).toEqual({
    google: "abc",
    yandex: "y1",
    other: { "msvalidate.01": "xyz" },
  });
  expect(nextVerification({ google: "abc" })).toEqual({ google: "abc" });
});

test("verificationTag handles both provider ids and raw names", () => {
  expect(verificationTag("google", "abc")).toEqual({
    name: "google-site-verification",
    content: "abc",
  });
  expect(verificationTag("my-engine-verify", "t")).toEqual({
    name: "my-engine-verify",
    content: "t",
  });
});
