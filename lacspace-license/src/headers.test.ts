import { describe, it, expect } from "vitest";
import {
  styleForFile, buildHeader, addHeader, updateHeader, removeHeader, hasHeader,
} from "./headers.js";
import type { HeaderFields } from "./headers.js";

const F: HeaderFields = { id: "MIT", year: 2026, holder: "Lacspace" };

describe("styleForFile — comment syntax per extension", () => {
  it("uses // for js/ts/go/rust/java/c", () => {
    for (const p of ["a.js", "a.ts", "a.tsx", "a.go", "a.rs", "a.java", "a.c", "a.cpp"]) {
      expect(styleForFile(p)).toEqual({ kind: "line", token: "//" });
    }
  });
  it("uses # for py/rb/sh/yaml", () => {
    for (const p of ["a.py", "a.rb", "a.sh", "a.yaml", "a.yml"]) {
      expect(styleForFile(p)).toEqual({ kind: "line", token: "#" });
    }
  });
  it("uses -- for sql/lua", () => {
    expect(styleForFile("q.sql")).toEqual({ kind: "line", token: "--" });
  });
  it("uses /* */ for css", () => {
    expect(styleForFile("a.css")).toEqual({ kind: "block" });
  });
  it("uses <!-- --> for html/xml/svg", () => {
    for (const p of ["a.html", "a.xml", "a.svg"]) expect(styleForFile(p)).toEqual({ kind: "xml" });
  });
  it("handles special filenames like Dockerfile", () => {
    expect(styleForFile("Dockerfile")).toEqual({ kind: "line", token: "#" });
  });
  it("returns null for unknown types", () => {
    expect(styleForFile("a.bin")).toBeNull();
    expect(styleForFile("noext")).toBeNull();
  });
});

describe("buildHeader — rendering", () => {
  const line = styleForFile("a.ts")!;
  const block = styleForFile("a.css")!;
  const xml = styleForFile("a.html")!;
  it("renders a line-comment header", () => {
    expect(buildHeader(line, F)).toBe("// Copyright (c) 2026 Lacspace\n// SPDX-License-Identifier: MIT");
  });
  it("renders a block-comment header", () => {
    expect(buildHeader(block, F)).toBe("/*\n * Copyright (c) 2026 Lacspace\n * SPDX-License-Identifier: MIT\n */");
  });
  it("renders an xml-comment header", () => {
    expect(buildHeader(xml, F)).toBe("<!--\n  Copyright (c) 2026 Lacspace\n  SPDX-License-Identifier: MIT\n-->");
  });
});

describe("addHeader — idempotent & safe", () => {
  const style = styleForFile("a.ts")!;

  it("adds a header to a plain file", () => {
    const r = addHeader("export const x = 1;\n", style, F);
    expect(r.changed).toBe(true);
    expect(r.content).toBe(
      "// Copyright (c) 2026 Lacspace\n// SPDX-License-Identifier: MIT\n\nexport const x = 1;\n",
    );
  });

  it("is idempotent — a second add is a no-op", () => {
    const first = addHeader("export const x = 1;\n", style, F);
    const second = addHeader(first.content, style, F);
    expect(second.changed).toBe(false);
    expect(second.content).toBe(first.content);
  });

  it("preserves a shebang and inserts the header after it", () => {
    const r = addHeader("#!/usr/bin/env node\nconsole.log(1);\n", style, F);
    expect(r.content.startsWith("#!/usr/bin/env node\n")).toBe(true);
    expect(r.content).toBe(
      "#!/usr/bin/env node\n// Copyright (c) 2026 Lacspace\n// SPDX-License-Identifier: MIT\n\nconsole.log(1);\n",
    );
    // idempotent with shebang too
    expect(addHeader(r.content, style, F).changed).toBe(false);
  });

  it("does not treat a non-licence top comment as a header (inserts above it)", () => {
    const src = "// eslint-disable-next-line\nconst x = 1;\n";
    const r = addHeader(src, style, F);
    expect(r.changed).toBe(true);
    expect(r.content).toContain("SPDX-License-Identifier: MIT");
    expect(r.content).toContain("// eslint-disable-next-line");
    // and it stays idempotent — the eslint comment isn't swallowed
    const again = addHeader(r.content, style, F);
    expect(again.changed).toBe(false);
    expect(removeHeader(r.content, style).content).toBe(src);
  });

  it("preserves CRLF line endings", () => {
    const r = addHeader("export const x = 1;\r\n", style, F);
    expect(r.content).toContain("\r\n");
    expect(r.content).toBe(
      "// Copyright (c) 2026 Lacspace\r\n// SPDX-License-Identifier: MIT\r\n\r\nexport const x = 1;\r\n",
    );
  });

  it("adds a block header to css and stays idempotent", () => {
    const style2 = styleForFile("a.css")!;
    const r = addHeader("body { color: red; }\n", style2, F);
    expect(r.content.startsWith("/*\n * Copyright")).toBe(true);
    expect(addHeader(r.content, style2, F).changed).toBe(false);
  });

  it("adds an xml header and stays idempotent", () => {
    const style2 = styleForFile("a.svg")!;
    const r = addHeader("<svg></svg>\n", style2, F);
    expect(r.content.startsWith("<!--\n  Copyright")).toBe(true);
    expect(addHeader(r.content, style2, F).changed).toBe(false);
  });
});

describe("updateHeader — refreshes fields", () => {
  const style = styleForFile("a.ts")!;
  it("refreshes the year and holder in place", () => {
    const withOld = addHeader("const x = 1;\n", style, { id: "MIT", year: 2020, holder: "Old" }).content;
    const updated = updateHeader(withOld, style, { id: "MIT", year: 2026, holder: "New" });
    expect(updated.changed).toBe(true);
    expect(updated.content).toContain("Copyright (c) 2026 New");
    expect(updated.content).not.toContain("2020");
    expect(updated.content).not.toContain("Old");
    // body untouched
    expect(updated.content).toContain("const x = 1;");
  });
  it("adds a header when none exists", () => {
    const r = updateHeader("const x = 1;\n", style, F);
    expect(r.changed).toBe(true);
    expect(r.content).toContain("SPDX-License-Identifier: MIT");
  });
  it("no-op when nothing changes", () => {
    const withH = addHeader("const x = 1;\n", style, F).content;
    expect(updateHeader(withH, style, F).changed).toBe(false);
  });
});

describe("removeHeader — strips only the header", () => {
  const style = styleForFile("a.ts")!;
  it("removes the header and its blank separator, restoring the original", () => {
    const src = "export const x = 1;\n";
    const withH = addHeader(src, style, F).content;
    const removed = removeHeader(withH, style);
    expect(removed.changed).toBe(true);
    expect(removed.content).toBe(src);
  });
  it("preserves a shebang when removing", () => {
    const src = "#!/usr/bin/env node\nconsole.log(1);\n";
    const withH = addHeader(src, style, F).content;
    expect(removeHeader(withH, style).content).toBe(src);
  });
  it("no-op when there is no header", () => {
    expect(removeHeader("const x = 1;\n", style).changed).toBe(false);
  });
  it("round-trips a css block header", () => {
    const style2 = styleForFile("a.css")!;
    const src = "body { color: red; }\n";
    const withH = addHeader(src, style2, F).content;
    expect(removeHeader(withH, style2).content).toBe(src);
  });
});

describe("hasHeader", () => {
  const style = styleForFile("a.ts")!;
  it("detects a present header", () => {
    expect(hasHeader(addHeader("x\n", style, F).content, style)).toBe(true);
  });
  it("returns false with no header", () => {
    expect(hasHeader("const x = 1;\n", style)).toBe(false);
  });
});
