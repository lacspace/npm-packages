#!/usr/bin/env node
/**
 * Publish every package in this repo whose version is not on npm yet.
 *
 *   node scripts/publish-pending.mjs                 list what is pending (no changes)
 *   node scripts/publish-pending.mjs --publish       build, test, publish each pending package
 *   node scripts/publish-pending.mjs --publish --dry-run
 *   node scripts/publish-pending.mjs --only @lacspace/seo,lacspace-sql --publish
 *   node scripts/publish-pending.mjs --only @lacspace/seo --rehearse
 *        full build → test → `npm publish --dry-run` even though it is already live
 *
 * Covers the npm workspaces AND the standalone tool folders (lacspace-*), which
 * have their own lockfiles. "Pending" is decided up front from the registry, so
 * a failed publish is always a failure, never mistaken for "already published".
 * Packages are published dependencies-first. In CI (GitHub Actions with
 * `id-token: write`) every publish carries an npm provenance attestation.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const REHEARSE = args.includes("--rehearse");
const PUBLISH = args.includes("--publish") || REHEARSE;
const DRY = args.includes("--dry-run") || REHEARSE;
const onlyArg = args[args.indexOf("--only") + 1];
const ONLY = args.includes("--only") && onlyArg ? new Set(onlyArg.split(",").map((s) => s.trim())) : null;
const CI = !!process.env.GITHUB_ACTIONS;

// Never published from here, whatever their package.json says.
const DENY = [/lumiform/i];

const rootPkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const workspaces = new Set(rootPkg.workspaces.map((w) => w.replace(/\/$/, "")));

const pkgs = [];
for (const dir of readdirSync(ROOT)) {
  const file = join(ROOT, dir, "package.json");
  if (dir === "node_modules" || dir.startsWith(".") || !existsSync(file)) continue;
  const json = JSON.parse(readFileSync(file, "utf8"));
  if (!json.name || !json.version || json.private) continue;
  if (DENY.some((re) => re.test(json.name) || re.test(dir))) continue;
  pkgs.push({ dir, name: json.name, version: json.version, json, workspace: workspaces.has(dir) });
}

const byName = new Map(pkgs.map((p) => [p.name, p]));

async function onRegistry(name, version) {
  const url = `https://registry.npmjs.org/${name.replace("/", "%2f")}/${version}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { accept: "application/json" } }).catch(() => null);
    if (res?.status === 200) return true;
    if (res?.status === 404) return false;
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  throw new Error(`registry lookup failed for ${name}@${version}`);
}

// Dependencies-first order among the packages in this repo.
function topo(list) {
  const set = new Set(list.map((p) => p.name));
  const done = new Set();
  const out = [];
  const visit = (p, stack = new Set()) => {
    if (done.has(p.name) || stack.has(p.name)) return;
    stack.add(p.name);
    const deps = { ...p.json.dependencies, ...p.json.peerDependencies };
    for (const d of Object.keys(deps)) if (set.has(d)) visit(byName.get(d), stack);
    done.add(p.name);
    out.push(p);
  };
  for (const p of list) visit(p);
  return out;
}

function run(cmd, argv, cwd) {
  console.log(`  $ ${cmd} ${argv.join(" ")}  (in ${cwd === ROOT ? "." : cwd.slice(ROOT.length + 1)})`);
  execFileSync(cmd, argv, { cwd, stdio: "inherit", env: process.env });
}

const candidates = pkgs.filter((p) => !ONLY || ONLY.has(p.name) || ONLY.has(p.dir));
if (ONLY && candidates.length !== ONLY.size) {
  const found = new Set(candidates.flatMap((p) => [p.name, p.dir]));
  console.error(`unknown package(s) in --only: ${[...ONLY].filter((n) => !found.has(n)).join(", ")}`);
  process.exit(1);
}

const flags = await Promise.all(candidates.map((p) => onRegistry(p.name, p.version)));
const pending = topo(candidates.filter((_, i) => REHEARSE || !flags[i]));

console.log(`${candidates.length} packages checked, ${pending.length} ${REHEARSE ? "to rehearse" : "pending"}:`);
for (const p of pending) console.log(`  ${p.name}@${p.version}  (${p.workspace ? "workspace" : "standalone"} ${p.dir}/)`);
if (!PUBLISH || pending.length === 0) process.exit(0);

if (!CI && !DRY) console.log("\nnote: not running in GitHub Actions, so these publishes carry NO provenance.\n");

// A fresh checkout has no dist/ anywhere, so every in-repo workspace dependency
// of a pending package must be built first (its types and entry live in dist/).
const pendingNames = new Set(pending.map((p) => p.name));
const depClosure = new Map();
const addDeps = (p) => {
  for (const d of Object.keys({ ...p.json.dependencies, ...p.json.peerDependencies })) {
    const dep = byName.get(d);
    if (!dep || !dep.workspace || depClosure.has(d) || pendingNames.has(d)) continue;
    depClosure.set(d, dep);
    addDeps(dep);
  }
};
for (const p of pending) if (p.workspace) addDeps(p);
for (const dep of topo([...depClosure.values()])) {
  if (!dep.json.scripts?.build || existsSync(join(ROOT, dep.dir, "dist")) && !CI) continue;
  console.log(`\n== build dependency ${dep.name}`);
  run("npm", ["run", "build"], join(ROOT, dep.dir));
}

const published = [];
for (const p of pending) {
  const cwd = join(ROOT, p.dir);
  console.log(CI ? `::group::${p.name}@${p.version}` : `\n== ${p.name}@${p.version}`);
  if (!p.workspace) run("npm", [existsSync(join(cwd, "package-lock.json")) ? "ci" : "install", "--no-audit", "--no-fund"], cwd);
  if (p.json.scripts?.build) run("npm", ["run", "build"], cwd);
  run("npx", ["vitest", "run", "--passWithNoTests"], cwd);
  // A rehearsal targets a version that is already live, which `npm publish
  // --dry-run` refuses, so it packs the identical tarball instead.
  const pub = REHEARSE ? ["pack", "--dry-run"] : ["publish", "--access", "public"];
  if (CI && !REHEARSE) pub.push("--provenance");
  if (DRY && !REHEARSE) pub.push("--dry-run");
  run("npm", pub, cwd);
  if (!DRY) {
    let live = false;
    // A new version can take a few minutes to appear; wait up to 8.
    for (let i = 0; i < 48 && !live; i++) {
      live = await onRegistry(p.name, p.version);
      if (!live) await new Promise((r) => setTimeout(r, 10_000));
    }
    if (!live) throw new Error(`${p.name}@${p.version} was published but is not visible on the registry`);
  }
  published.push(`${p.name}@${p.version}`);
  if (CI) console.log("::endgroup::");
}
console.log(`\n${DRY ? "dry run OK" : "published"}: ${published.join(", ")}`);
