import { describe, it, expect } from "vitest";
import { mock, mockObject } from "./index";

describe("mockObject", () => {
  it("turns functions into spies that keep real behaviour", () => {
    const svc = mockObject({ save: (x: number) => x * 2, name: "db" });
    expect(svc.save(21)).toBe(42);
    expect(svc.save.calledWith(21)).toBe(true);
    expect(svc.name).toBe("db");
  });

  it("does not mutate the input", () => {
    const orig = { fn: () => 1 };
    const m = mockObject(orig);
    expect(m.fn).not.toBe(orig.fn);
    expect(typeof orig.fn).toBe("function");
  });

  it("recurses into nested plain objects", () => {
    const m = mockObject({ db: { read: () => "row" }, count: 3 });
    expect(m.db.read()).toBe("row");
    expect(m.db.read.called).toBe(true);
    expect(m.count).toBe(3);
  });

  it("spies can be reprogrammed", () => {
    const m = mockObject({ get: (): string => "real" });
    m.get.returns("fake");
    expect(m.get()).toBe("fake");
  });
});

describe("mock", () => {
  it("with a shape behaves like mockObject", () => {
    const m = mock<{ hello(): string }>({ hello: () => "hi" });
    expect(m.hello()).toBe("hi");
    expect(m.hello.called).toBe(true);
  });

  it("auto-mocks any accessed property as a spy", () => {
    interface Logger {
      info(msg: string): void;
      warn(msg: string): void;
    }
    const log = mock<Logger>();
    log.info("hello");
    expect(log.info.calledWith("hello")).toBe(true);
    expect(log.warn.called).toBe(false);
  });

  it("returns the same spy for repeated access to a property", () => {
    const m = mock<{ go(): void }>();
    expect(m.go).toBe(m.go);
    m.go();
    expect(m.go.callCount).toBe(1);
  });

  it("allows overriding an auto-mocked property by assignment", () => {
    const m = mock<{ value: number }>();
    m.value = 5 as never;
    expect(m.value).toBe(5);
  });
});
