import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { findLicenseFile, findPackageJson, walkFiles } from "./pkg.js";
import { detectLicense, sameLicense } from "./detect.js";
import { styleForFile, hasHeader, addHeader } from "./headers.js";
import { generateLicense } from "./generate.js";
import { resolveId } from "./spdx.js";

/** A single problem found by `check`. */
export interface CheckIssue {
  code: "no-license-file" | "undetected-license" | "license-mismatch" | "missing-header" | "no-package-json";
  message: string;
  /** File path the issue relates to, if any. */
  file?: string;
}

/** The result of running the CI gate. */
export interface CheckResult {
  ok: boolean;
  /** Path to the LICENSE file that was found, if any. */
  licenseFile?: string;
  /** Licence id detected from the LICENSE file. */
  detected?: string;
  /** Licence id declared in package.json. */
  declared?: string;
  /** Whether declared and detected agree. */
  licenseMatches?: boolean;
  /** Source files missing a header (only when requireHeaders). */
  missingHeaders: string[];
  /** How many source files were inspected for headers. */
  headersChecked: number;
  issues: CheckIssue[];
  /** Human-readable description of each repair made when `fix` was set. */
  fixed: string[];
}

/** Options controlling the CI gate. */
export interface CheckOptions {
  /** Project root (default: cwd). */
  cwd?: string;
  /** Require every source file under `src` to carry a header. */
  requireHeaders?: boolean;
  /** Source directory to scan for headers (default: "src"). */
  src?: string;
  /** Repair what can be repaired: write a missing LICENSE, align package.json,
   *  and insert missing headers. Off by default (a pure gate). */
  fix?: boolean;
  /** Copyright holder used when `fix` generates a LICENSE / header (default: package.json author). */
  holder?: string;
  /** Copyright year used when `fix` generates a LICENSE / header (default: current year). */
  year?: string | number;
}

/**
 * CI gate: verify a LICENSE exists, that it matches `package.json.license`, and
 * (optionally) that every source file carries a header. Never throws — inspect
 * `result.ok` and `result.issues`.
 */
export function checkProject(opts: CheckOptions = {}): CheckResult {
  const cwd = opts.cwd ?? process.cwd();
  const fix = opts.fix === true;
  const issues: CheckIssue[] = [];
  const fixed: string[] = [];
  const result: CheckResult = { ok: true, missingHeaders: [], headersChecked: 0, issues, fixed };
  const pkg = findPackageJson(cwd);

  const holder = opts.holder ?? pkg?.author;
  const fillFields: { holder?: string; year?: string | number } = {};
  if (holder) fillFields.holder = holder;
  if (opts.year !== undefined) fillFields.year = opts.year;

  // 1. LICENSE file present?
  let licenseFile = findLicenseFile(cwd);
  if (!licenseFile) {
    // --fix: if package.json names a resolvable licence, write a LICENSE for it.
    const declaredId = pkg?.license ? resolveId(pkg.license) : null;
    if (fix && declaredId) {
      const target = join(cwd, "LICENSE");
      writeFileSync(target, generateLicense(declaredId, fillFields).text);
      fixed.push(`Wrote LICENSE (${declaredId}).`);
      licenseFile = target;
    } else {
      issues.push({ code: "no-license-file", message: "No LICENSE file found in project root." });
    }
  }

  if (licenseFile) {
    result.licenseFile = licenseFile;
    const text = readFileSync(licenseFile, "utf8");
    const detected = detectLicense(text);
    if (!detected) {
      issues.push({
        code: "undetected-license",
        message: `Could not identify the licence in ${relative(cwd, licenseFile)}.`,
        file: licenseFile,
      });
    } else {
      result.detected = detected;
    }

    // 2. Matches package.json?
    if (pkg?.license) {
      result.declared = pkg.license;
      if (detected) {
        let matches = sameLicense(detected, pkg.license) ||
          /* declared may be "SEE LICENSE IN LICENSE" style → treat as match when a file exists */
          /^SEE LICEN[SC]E/i.test(pkg.license);
        if (!matches && fix) {
          // --fix: align package.json's license field with the detected LICENSE.
          if (alignPackageLicense(pkg.path, detected)) {
            fixed.push(`Set package.json "license" to ${detected}.`);
            result.declared = detected;
            matches = true;
          }
        }
        result.licenseMatches = matches;
        if (!matches) {
          issues.push({
            code: "license-mismatch",
            message: `LICENSE file is ${detected} but package.json declares "${pkg.license}".`,
            file: licenseFile,
          });
        }
      }
    }
  }

  // 3. Headers (opt-in)
  if (opts.requireHeaders) {
    const srcDir = join(cwd, opts.src ?? "src");
    if (!existsSync(srcDir) || !statSync(srcDir).isDirectory()) {
      // nothing to check; not an error on its own
    } else {
      const headerId = result.detected ?? (pkg?.license ? resolveId(pkg.license) : null);
      for (const file of walkFiles(srcDir)) {
        const style = styleForFile(file);
        if (!style) continue; // unknown type — skip
        result.headersChecked++;
        let content: string;
        try {
          content = readFileSync(file, "utf8");
        } catch {
          continue;
        }
        if (hasHeader(content, style)) continue;
        // --fix: insert a header when we know which licence to stamp.
        if (fix && headerId) {
          const res = addHeader(content, style, { id: headerId, ...fillFields });
          if (res.changed) {
            writeFileSync(file, res.content);
            fixed.push(`Added header: ${relative(cwd, file)}`);
            continue;
          }
        }
        result.missingHeaders.push(file);
        issues.push({
          code: "missing-header",
          message: `Missing licence header: ${relative(cwd, file)}`,
          file,
        });
      }
    }
  }

  result.ok = issues.length === 0;
  return result;
}

/** Rewrite a package.json's `license` field in place, preserving 2-space JSON. */
function alignPackageLicense(pkgPath: string, id: string): boolean {
  try {
    const raw = JSON.parse(readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
    raw.license = id;
    writeFileSync(pkgPath, JSON.stringify(raw, null, 2) + "\n");
    return true;
  } catch {
    return false;
  }
}
