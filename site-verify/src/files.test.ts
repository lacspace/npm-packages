import { test, expect } from "vitest";
import { verificationFileFor, verificationFile } from "./index";

test("verificationFileFor delegates google/bing/yandex to verificationFile", () => {
  expect(verificationFileFor("google", "abc123")).toEqual(verificationFile("google", "abc123"));
  expect(verificationFileFor("bing", "TOKEN")).toEqual(verificationFile("bing", "TOKEN"));
  expect(verificationFileFor("yandex", "TOKEN")).toEqual(verificationFile("yandex", "TOKEN"));
});

test("verificationFileFor emits the Baidu file with the raw code as content", () => {
  expect(verificationFileFor("baidu", "code123")).toEqual({
    path: "/baidu_verify_code123.html",
    content: "code123",
    contentType: "text/html",
  });
});

test("verificationFileFor tolerates an already-formatted Baidu token", () => {
  expect(verificationFileFor("baidu", "baidu_verify_code123.html")).toEqual({
    path: "/baidu_verify_code123.html",
    content: "code123",
    contentType: "text/html",
  });
});

test("verificationFileFor generic fallback carries the resolved meta tag", () => {
  const f = verificationFileFor("pinterest", "pin456");
  expect(f.path).toBe("/pinterest.html");
  expect(f.contentType).toBe("text/html");
  expect(f.content).toContain('<meta name="p:domain_verify" content="pin456" />');
});
