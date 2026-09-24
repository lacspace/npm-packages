import { test, expect } from "vitest";
import { slugifyFilename } from "./index";

// slugifyFilename split at the LAST dot, so a two-part extension lost its first
// half to the slugified base: `archive.tar.gz` became `archive-tar.gz`. That
// changes what the file is — no longer a tarball to anything that inspects the
// name — not merely what it is called.
test("compound archive extensions are kept whole", () => {
  expect(slugifyFilename("archive.tar.gz")).toBe("archive.tar.gz");
  expect(slugifyFilename("My Backup.TAR.GZ")).toBe("my-backup.tar.gz");
  expect(slugifyFilename("dump.tar.bz2")).toBe("dump.tar.bz2");
  expect(slugifyFilename("dump.tar.xz")).toBe("dump.tar.xz");
  expect(slugifyFilename("dump.tar.zst")).toBe("dump.tar.zst");
});

test("TypeScript declaration and test/spec/min suffixes are kept whole", () => {
  expect(slugifyFilename("types.d.ts")).toBe("types.d.ts");
  expect(slugifyFilename("Types.D.MTS")).toBe("types.d.mts");
  expect(slugifyFilename("app.min.js")).toBe("app.min.js");
  expect(slugifyFilename("site.min.css")).toBe("site.min.css");
  expect(slugifyFilename("foo.test.ts")).toBe("foo.test.ts");
  expect(slugifyFilename("Foo Bar.spec.tsx")).toBe("foo-bar.spec.tsx");
});

test("a dotted base name that is not a compound extension still slugifies as before", () => {
  expect(slugifyFilename("my.photo.jpg")).toBe("my-photo.jpg");
  expect(slugifyFilename("report.2024.pdf")).toBe("report-2024.pdf");
  expect(slugifyFilename("John.Smith.pdf")).toBe("john-smith.pdf");
});

test("a bare compound extension is not treated as one", () => {
  // "tar.gz" has no base — the file is literally named tar.gz.
  expect(slugifyFilename("tar.gz")).toBe("tar.gz");
});

test("the single-extension cases are unchanged", () => {
  expect(slugifyFilename("My Résumé.PDF")).toBe("my-resume.pdf");
  expect(slugifyFilename("photo.jpg")).toBe("photo.jpg");
  expect(slugifyFilename("noext")).toBe("noext");
  expect(slugifyFilename(".htaccess")).toBe("htaccess");
  expect(slugifyFilename("weird.c++")).toBe("weird.c");
});

test("the extension keeps no stray leading or doubled dots", () => {
  expect(slugifyFilename("a..b")).toBe("a.b");
  expect(slugifyFilename("file.")).toBe("file");
});

test("lower:false preserves extension case in a compound extension", () => {
  expect(slugifyFilename("Archive.TAR.GZ", { lower: false })).toBe("Archive.TAR.GZ");
});
