import { test, expect } from "vitest";
import { verificationTxt, verificationTxtAll } from "./index";

test("verificationTxt builds a google DNS TXT record", () => {
  expect(verificationTxt("google", "abc123")).toEqual({
    host: "@",
    type: "TXT",
    name: "google-site-verification",
    value: "google-site-verification=abc123",
  });
});

test("verificationTxt resolves facebook domain verification", () => {
  expect(verificationTxt("facebook", "fb1")).toEqual({
    host: "@",
    type: "TXT",
    name: "facebook-domain-verification",
    value: "facebook-domain-verification=fb1",
  });
});

test("verificationTxt passes a raw name through and honours a custom host", () => {
  expect(verificationTxt("my-engine-verify", "t", { host: "_verify" })).toEqual({
    host: "_verify",
    type: "TXT",
    name: "my-engine-verify",
    value: "my-engine-verify=t",
  });
});

test("verificationTxtAll skips empty tokens", () => {
  expect(verificationTxtAll({ google: "abc", bing: "", yandex: "y1" })).toEqual([
    { host: "@", type: "TXT", name: "google-site-verification", value: "google-site-verification=abc" },
    { host: "@", type: "TXT", name: "yandex-verification", value: "yandex-verification=y1" },
  ]);
});
