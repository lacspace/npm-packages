import { describe, it, expect } from "vitest";
import {
  purlFor,
  spdxId,
  componentsFromInstalled,
  componentsFromDeclared,
  componentsFromInventory,
  buildCycloneDx,
  buildSpdx,
  buildSbom,
  TOOL_NAME,
  TOOL_VERSION,
} from "./sbom.js";
import type { SbomComponent, SbomMeta } from "./sbom.js";
import type { InstalledPackage, Inventory, DeclaredDep } from "./inventory.js";

const inst = (name: string, version: string, license: string | null): InstalledPackage => ({
  name, version, path: `node_modules/${name}`, dir: `/x/${name}`, depth: 0,
  direct: true, dev: false, license, dependencies: [],
});

const comps: SbomComponent[] = [
  { name: "left-pad", version: "1.3.0", license: "MIT" },
  { name: "@scope/pkg", version: "2.0.0", license: "(MIT OR Apache-2.0)" },
  { name: "mystery", version: "0.0.1", license: null },
];

const meta: SbomMeta = {
  name: "demo-app",
  version: "1.0.0",
  now: "2026-01-01T00:00:00.000Z",
  serialNumber: "urn:uuid:11111111-1111-1111-1111-111111111111",
  namespace: "https://example.test/spdx/demo",
};

describe("purlFor", () => {
  it("builds an npm purl", () => {
    expect(purlFor("left-pad", "1.3.0")).toBe("pkg:npm/left-pad@1.3.0");
  });
  it("url-encodes the scope's leading @ but keeps the slash", () => {
    expect(purlFor("@babel/core", "7.0.0")).toBe("pkg:npm/%40babel/core@7.0.0");
  });
});

describe("spdxId", () => {
  it("prefixes SPDXRef-Package and keeps valid chars", () => {
    expect(spdxId("left-pad", "1.3.0")).toBe("SPDXRef-Package-left-pad-1.3.0");
  });
  it("sanitizes scoped names / invalid chars to dashes", () => {
    expect(spdxId("@scope/pkg", "2.0.0")).toBe("SPDXRef-Package-scope-pkg-2.0.0");
    expect(spdxId("@scope/pkg", "2.0.0")).toMatch(/^SPDXRef-Package-[A-Za-z0-9.-]+$/);
  });
});

describe("componentsFromInstalled / Declared / Inventory", () => {
  it("dedupes installed by name@version and sorts", () => {
    const out = componentsFromInstalled([
      inst("b", "1.0.0", "MIT"),
      inst("b", "1.0.0", "MIT"),
      inst("a", "2.0.0", "ISC"),
    ]);
    expect(out.map((c) => c.name)).toEqual(["a", "b"]);
  });
  it("keeps a license found on a later duplicate copy", () => {
    const out = componentsFromInstalled([
      inst("a", "1.0.0", null),
      inst("a", "1.0.0", "MIT"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.license).toBe("MIT");
  });
  it("derives declared components with the range stripped to a version", () => {
    const declared: DeclaredDep[] = [{ name: "foo", range: "^1.2.3", type: "prod" }];
    const out = componentsFromDeclared(declared);
    expect(out[0]).toEqual({ name: "foo", version: "1.2.3", license: null });
  });
  it("uses installed when present, else falls back to declared", () => {
    const withInstalled: Inventory = {
      root: "/x", projectName: "p", projectVersion: "1.0.0", declared: [],
      lockfileType: "npm-v3", hasNodeModules: true, installed: [inst("a", "1.0.0", "MIT")],
    };
    const noInstalled: Inventory = {
      ...withInstalled, hasNodeModules: false, installed: [],
      declared: [{ name: "z", range: "~3.0.0", type: "prod" }],
    };
    expect(componentsFromInventory(withInstalled).map((c) => c.name)).toEqual(["a"]);
    expect(componentsFromInventory(noInstalled).map((c) => c.name)).toEqual(["z"]);
  });
});

describe("buildCycloneDx", () => {
  const doc = buildCycloneDx(comps, meta);
  it("has the right envelope + injected serial/timestamp", () => {
    expect(doc.bomFormat).toBe("CycloneDX");
    expect(doc.specVersion).toBe("1.5");
    expect(doc.version).toBe(1);
    expect(doc.serialNumber).toBe(meta.serialNumber);
    expect(doc.metadata.timestamp).toBe(meta.now);
  });
  it("records the tool identity", () => {
    expect(doc.metadata.tools[0]).toMatchObject({ name: TOOL_NAME, version: TOOL_VERSION });
  });
  it("includes the root as an application component", () => {
    expect(doc.metadata.component).toMatchObject({ type: "application", name: "demo-app", version: "1.0.0" });
  });
  it("emits one library component per input with purl + bom-ref", () => {
    expect(doc.components).toHaveLength(3);
    const lp = doc.components.find((c) => c.name === "left-pad")!;
    expect(lp.type).toBe("library");
    expect(lp.purl).toBe("pkg:npm/left-pad@1.3.0");
    expect(lp["bom-ref"]).toBe(lp.purl);
  });
  it("maps a single license to an id and a compound one to an expression", () => {
    const lp = doc.components.find((c) => c.name === "left-pad")!;
    expect(lp.licenses).toEqual([{ license: { id: "MIT" } }]);
    const scoped = doc.components.find((c) => c.name === "@scope/pkg")!;
    expect(scoped.licenses).toEqual([{ expression: "(MIT OR Apache-2.0)" }]);
  });
  it("omits licenses when the package has none", () => {
    const m = doc.components.find((c) => c.name === "mystery")!;
    expect(m.licenses).toBeUndefined();
  });
});

describe("buildSpdx", () => {
  const doc = buildSpdx(comps, meta);
  it("has the SPDX 2.3 envelope + injected namespace/timestamp", () => {
    expect(doc.spdxVersion).toBe("SPDX-2.3");
    expect(doc.dataLicense).toBe("CC0-1.0");
    expect(doc.SPDXID).toBe("SPDXRef-DOCUMENT");
    expect(doc.documentNamespace).toBe(meta.namespace);
    expect(doc.creationInfo.created).toBe(meta.now);
  });
  it("names the tool as a creator", () => {
    expect(doc.creationInfo.creators).toContain(`Tool: ${TOOL_NAME}-${TOOL_VERSION}`);
  });
  it("emits one package per component with a purl externalRef", () => {
    expect(doc.packages).toHaveLength(3);
    const lp = doc.packages.find((p) => p.name === "left-pad")!;
    expect(lp.SPDXID).toBe("SPDXRef-Package-left-pad-1.3.0");
    expect(lp.versionInfo).toBe("1.3.0");
    expect(lp.licenseDeclared).toBe("MIT");
    expect(lp.externalRefs[0]).toMatchObject({ referenceType: "purl", referenceLocator: "pkg:npm/left-pad@1.3.0" });
  });
  it("uses NOASSERTION for a missing license", () => {
    const m = doc.packages.find((p) => p.name === "mystery")!;
    expect(m.licenseDeclared).toBe("NOASSERTION");
  });
  it("DESCRIBES every package from the document root", () => {
    expect(doc.relationships).toHaveLength(3);
    for (const rel of doc.relationships) {
      expect(rel.spdxElementId).toBe("SPDXRef-DOCUMENT");
      expect(rel.relationshipType).toBe("DESCRIBES");
    }
  });
});

describe("buildSbom dispatcher", () => {
  const inv: Inventory = {
    root: "/x", projectName: "demo-app", projectVersion: "1.0.0", declared: [],
    lockfileType: "npm-v3", hasNodeModules: true,
    installed: [inst("left-pad", "1.3.0", "MIT")],
  };
  it("returns CycloneDX for format cyclonedx", () => {
    const doc = buildSbom(inv, { format: "cyclonedx", now: meta.now, serialNumber: meta.serialNumber });
    expect("bomFormat" in doc && doc.bomFormat).toBe("CycloneDX");
  });
  it("returns SPDX for format spdx", () => {
    const doc = buildSbom(inv, { format: "spdx", now: meta.now, namespace: meta.namespace });
    expect("spdxVersion" in doc && doc.spdxVersion).toBe("SPDX-2.3");
  });
  it("generates a fresh urn:uuid serial when none injected", () => {
    const doc = buildCycloneDx(comps, { name: "x", version: "1.0.0" });
    expect(doc.serialNumber).toMatch(/^urn:uuid:[0-9a-f-]{36}$/);
  });
});
