import { readFileSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { findLicenseFile, findPackageJson, walkFiles } from "./pkg.js";
import { detectLicense, sameLicense } from "./detect.js";
import { styleForFile, hasHeader } from "./headers.js";

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
}

/** Options controlling the CI gate. */
export interface CheckOptions {
  /** Project root (default: cwd). */
  cwd?: string;
  /** Require every source file under `src` to carry a header. */
  requireHeaders?: boolean;
  /** Source directory to scan for headers (default: "src"). */
  src?: string;
  /** Only fail on header issues for files with these extensions (default: all known). */
}

/**
 * CI gate: verify a LICENSE exists, that it matches `package.json.license`, and
 * (optionally) that every source file carries a header. Never throws — inspect
 * `result.ok` and `result.issues`.
 */
export function checkProject(opts: CheckOptions = {}): CheckResult {
  const cwd = opts.cwd ?? process.cwd();
  const issues: CheckIssue[] = [];
  const result: CheckResult = { ok: true, missingHeaders: [], headersChecked: 0, issues };

  // 1. LICENSE file present?
  const licenseFile = findLicenseFile(cwd);
  if (!licenseFile) {
    issues.push({ code: "no-license-file", message: "No LICENSE file found in project root." });
  } else {
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
    const pkg = findPackageJson(cwd);
    if (pkg?.license) {
      result.declared = pkg.license;
      if (detected) {
        const matches = sameLicense(detected, pkg.license) ||
          /* declared may be "SEE LICENSE IN LICENSE" style → treat as match when a file exists */
          /^SEE LICEN[SC]E/i.test(pkg.license);
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
        if (!hasHeader(content, style)) {
          result.missingHeaders.push(file);
          issues.push({
            code: "missing-header",
            message: `Missing licence header: ${relative(cwd, file)}`,
            file,
          });
        }
      }
    }
  }

  result.ok = issues.length === 0;
  return result;
}
