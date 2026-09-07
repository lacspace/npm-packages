import { randomUUID } from "node:crypto";
import type { Inventory, InstalledPackage, DeclaredDep } from "./inventory.js";
import { splitExpression } from "./licenses.js";

/** Which SBOM standard to emit. */
export type SbomFormat = "cyclonedx" | "spdx";

/** The tool identity stamped into generated SBOMs. */
export const TOOL_NAME = "lacspace-deps";
export const TOOL_VERSION = "0.2.0";
export const TOOL_VENDOR = "Lacspace";

/** One component (installed or declared package) going into an SBOM. */
export interface SbomComponent {
  name: string;
  version: string;
  license: string | null;
}

/** Root/project metadata + injectable determinism knobs for an SBOM. */
export interface SbomMeta {
  name: string | null;
  version: string | null;
  /** ISO timestamp; injectable so tests get a stable document. */
  now?: string;
  /** CycloneDX `serialNumber` (urn:uuid:…); injectable. */
  serialNumber?: string;
  /** SPDX `documentNamespace`; injectable. */
  namespace?: string;
}

export interface SbomOptions extends Partial<Omit<SbomMeta, "name" | "version">> {
  format: SbomFormat;
}

/** Build a Package-URL for an npm package (`pkg:npm/name@version`). */
export function purlFor(name: string, version: string): string {
  // Scoped names keep their slash but URL-encode the leading "@".
  const enc = name.startsWith("@") ? `%40${name.slice(1)}` : name;
  return `pkg:npm/${enc}@${version}`;
}

/** Build a valid SPDX element id — only [A-Za-z0-9.-] survive. */
export function spdxId(name: string, version: string): string {
  const safe = `${name}-${version}`
    .replace(/[^A-Za-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `SPDXRef-Package-${safe || "unknown"}`;
}

/** Dedupe installed packages to one component per name@version, sorted. */
export function componentsFromInstalled(installed: InstalledPackage[]): SbomComponent[] {
  const seen = new Map<string, SbomComponent>();
  for (const p of installed) {
    const key = `${p.name}@${p.version}`;
    const prev = seen.get(key);
    if (!prev) seen.set(key, { name: p.name, version: p.version, license: p.license });
    else if (!prev.license && p.license) prev.license = p.license;
  }
  return [...seen.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
}

/** Fallback components from the declared set (no node_modules on disk). */
export function componentsFromDeclared(declared: DeclaredDep[]): SbomComponent[] {
  const seen = new Map<string, SbomComponent>();
  for (const d of declared) {
    const version = d.range.replace(/^[\^~>=<\s]+/, "").trim() || "unknown";
    const key = `${d.name}@${version}`;
    if (!seen.has(key)) seen.set(key, { name: d.name, version, license: null });
  }
  return [...seen.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
}

/** Pick SBOM components from an inventory — installed first, else declared. */
export function componentsFromInventory(inv: Inventory): SbomComponent[] {
  return inv.installed.length
    ? componentsFromInstalled(inv.installed)
    : componentsFromDeclared(inv.declared);
}

// ── CycloneDX 1.5 (JSON) ───────────────────────────────────────────────────

export interface CycloneDxDocument {
  bomFormat: "CycloneDX";
  specVersion: "1.5";
  serialNumber: string;
  version: number;
  metadata: {
    timestamp: string;
    tools: { vendor: string; name: string; version: string }[];
    component?: { type: "application"; "bom-ref": string; name: string; version: string };
  };
  components: CycloneDxComponent[];
}

export interface CycloneDxComponent {
  type: "library";
  "bom-ref": string;
  name: string;
  version: string;
  purl: string;
  licenses?: Array<{ license: { id: string } | { name: string } } | { expression: string }>;
}

function cdxLicenses(license: string | null): CycloneDxComponent["licenses"] | undefined {
  if (!license) return undefined;
  const parts = splitExpression(license);
  if (parts.length > 1) return [{ expression: license }];
  const id = parts[0] ?? license;
  // A bare single token is treated as an SPDX id; expressions use `expression`.
  return [{ license: { id } }];
}

/** Build a CycloneDX 1.5 JSON document from components + project metadata. */
export function buildCycloneDx(components: SbomComponent[], meta: SbomMeta): CycloneDxDocument {
  const doc: CycloneDxDocument = {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber: meta.serialNumber ?? `urn:uuid:${randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: meta.now ?? new Date().toISOString(),
      tools: [{ vendor: TOOL_VENDOR, name: TOOL_NAME, version: TOOL_VERSION }],
    },
    components: components.map((c) => {
      const comp: CycloneDxComponent = {
        type: "library",
        "bom-ref": purlFor(c.name, c.version),
        name: c.name,
        version: c.version,
        purl: purlFor(c.name, c.version),
      };
      const lic = cdxLicenses(c.license);
      if (lic) comp.licenses = lic;
      return comp;
    }),
  };
  if (meta.name) {
    const version = meta.version ?? "0.0.0";
    doc.metadata.component = {
      type: "application",
      "bom-ref": purlFor(meta.name, version),
      name: meta.name,
      version,
    };
  }
  return doc;
}

// ── SPDX 2.3 (JSON) ─────────────────────────────────────────────────────────

export interface SpdxDocument {
  spdxVersion: "SPDX-2.3";
  dataLicense: "CC0-1.0";
  SPDXID: "SPDXRef-DOCUMENT";
  name: string;
  documentNamespace: string;
  creationInfo: { created: string; creators: string[] };
  packages: SpdxPackage[];
  relationships: SpdxRelationship[];
}

export interface SpdxPackage {
  name: string;
  SPDXID: string;
  versionInfo: string;
  downloadLocation: string;
  filesAnalyzed: boolean;
  licenseConcluded: string;
  licenseDeclared: string;
  externalRefs: Array<{
    referenceCategory: string;
    referenceType: string;
    referenceLocator: string;
  }>;
}

export interface SpdxRelationship {
  spdxElementId: string;
  relationshipType: string;
  relatedSpdxElement: string;
}

/** Build an SPDX 2.3 JSON document from components + project metadata. */
export function buildSpdx(components: SbomComponent[], meta: SbomMeta): SpdxDocument {
  const created = meta.now ?? new Date().toISOString();
  const docName = meta.name ? `${meta.name}@${meta.version ?? "0.0.0"}` : "sbom";
  const namespace =
    meta.namespace ?? `https://lacspace.com/spdx/${encodeURIComponent(docName)}-${randomUUID()}`;

  const packages: SpdxPackage[] = components.map((c) => {
    const declared = c.license && c.license.trim() ? c.license : "NOASSERTION";
    return {
      name: c.name,
      SPDXID: spdxId(c.name, c.version),
      versionInfo: c.version,
      downloadLocation: "NOASSERTION",
      filesAnalyzed: false,
      licenseConcluded: "NOASSERTION",
      licenseDeclared: declared,
      externalRefs: [
        {
          referenceCategory: "PACKAGE-MANAGER",
          referenceType: "purl",
          referenceLocator: purlFor(c.name, c.version),
        },
      ],
    };
  });

  const relationships: SpdxRelationship[] = packages.map((p) => ({
    spdxElementId: "SPDXRef-DOCUMENT",
    relationshipType: "DESCRIBES",
    relatedSpdxElement: p.SPDXID,
  }));

  return {
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: docName,
    documentNamespace: namespace,
    creationInfo: {
      created,
      creators: [`Tool: ${TOOL_NAME}-${TOOL_VERSION}`, `Organization: ${TOOL_VENDOR}`],
    },
    packages,
    relationships,
  };
}

/**
 * Build an SBOM document (CycloneDX or SPDX JSON) from a project inventory.
 * Pure aside from the default timestamp / UUID, both injectable via `opts` for
 * deterministic output.
 */
export function buildSbom(
  inv: Inventory,
  opts: SbomOptions,
): CycloneDxDocument | SpdxDocument {
  const components = componentsFromInventory(inv);
  const meta: SbomMeta = {
    name: inv.projectName,
    version: inv.projectVersion,
    ...(opts.now ? { now: opts.now } : {}),
    ...(opts.serialNumber ? { serialNumber: opts.serialNumber } : {}),
    ...(opts.namespace ? { namespace: opts.namespace } : {}),
  };
  return opts.format === "spdx" ? buildSpdx(components, meta) : buildCycloneDx(components, meta);
}
