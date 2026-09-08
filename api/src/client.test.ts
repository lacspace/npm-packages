import { test, expect } from "vitest";
import { LacspaceApi } from "./index";
import { formBody } from "./forms";

interface Call {
  url: string;
  init: RequestInit;
}

/** A fully offline fake fetch that replays a queue (or one) of responses. */
function fakeFetch(responder: (url: string, init: RequestInit, call: number) => Response) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    return responder(url, init ?? {}, calls.length - 1);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const BASE = "https://api.test.local";

test("head() defaults to a Response and never reads the body", async () => {
  const { impl, calls } = fakeFetch(() => new Response(null, { status: 200, headers: { etag: "W/123" } }));
  const api = new LacspaceApi({ baseURL: BASE, fetch: impl });
  const res = await api.head("things/1");
  expect(res).toBeInstanceOf(Response);
  expect(res.headers.get("etag")).toBe("W/123");
  expect(calls[0]?.init.method).toBe("HEAD");
});

test("options() issues an OPTIONS request returning the Response", async () => {
  const { impl, calls } = fakeFetch(() => new Response(null, { status: 204, headers: { allow: "GET,POST" } }));
  const api = new LacspaceApi({ baseURL: BASE, fetch: impl });
  const res = await api.options("things");
  expect(res.headers.get("allow")).toBe("GET,POST");
  expect(calls[0]?.init.method).toBe("OPTIONS");
});

test("formBody posts application/x-www-form-urlencoded untouched", async () => {
  const { impl, calls } = fakeFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  const api = new LacspaceApi({ baseURL: BASE, fetch: impl });
  await api.post("login", formBody({ email: "a@b.com", password: "pw" }));
  const body = calls[0]?.init.body;
  expect(body).toBeInstanceOf(URLSearchParams);
  expect(String(body)).toBe("email=a%40b.com&password=pw");
  // client must NOT force a JSON content-type on a passthrough body
  const headers = calls[0]?.init.headers as Record<string, string>;
  expect(headers["Content-Type"]).toBeUndefined();
});

test("paginateCursor follows nextCursor until it runs out", async () => {
  const pages = [
    { data: [1, 2], nextCursor: "c2" },
    { data: [3, 4], next_cursor: "c3" },
    { data: [5], nextCursor: null },
  ];
  const { impl, calls } = fakeFetch((_url, _init, n) => new Response(JSON.stringify(pages[n]), { status: 200 }));
  const api = new LacspaceApi({ baseURL: BASE, fetch: impl });
  const out: number[] = [];
  for await (const item of api.paginateCursor<number>("feed")) out.push(item);
  expect(out).toEqual([1, 2, 3, 4, 5]);
  expect(calls.length).toBe(3);
  expect(calls[0]?.url).toBe(`${BASE}/feed`);
  expect(calls[1]?.url).toBe(`${BASE}/feed?cursor=c2`);
});

test("getAllCursor collects everything and respects maxPages", async () => {
  const { impl, calls } = fakeFetch(() => new Response(JSON.stringify({ items: [1], nextCursor: "x" }), { status: 200 }));
  const api = new LacspaceApi({ baseURL: BASE, fetch: impl });
  const all = await api.getAllCursor<number>("loop", { maxPages: 3 });
  expect(all).toEqual([1, 1, 1]);
  expect(calls.length).toBe(3);
});

test("no request touches the network — fake fetch recorded every call", async () => {
  const { impl, calls } = fakeFetch(() => new Response("{}", { status: 200 }));
  const api = new LacspaceApi({ baseURL: BASE, fetch: impl });
  await api.get("ping");
  expect(calls.length).toBe(1);
});
