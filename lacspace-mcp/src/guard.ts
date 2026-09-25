/** Safety checks shared by the tools: which URLs may be fetched, which files read. */
import { realpath } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import { assertDeliverableUrl } from "@lacspace/webhooks";
import type { Policy } from "./server";

/** Throws with a readable reason when the policy forbids fetching `url`. */
export async function checkUrl(url: string, policy: Policy): Promise<URL> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`not a valid URL: ${url}`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`only http(s) URLs can be fetched, got ${u.protocol}`);
  if (policy.blockPrivate) {
    // The webhooks guard knows every spelling of "inside the network".
    await assertDeliverableUrl(u.toString(), { blockPrivateNetworks: true });
  }
  return u;
}

/**
 * Resolve a local path and confirm it sits under one of the allowed roots,
 * following symlinks so a link out of the sandbox is refused too.
 */
export async function checkPath(file: string, policy: Policy): Promise<string> {
  const abs = isAbsolute(file) ? file : resolve(process.cwd(), file);
  let real: string;
  try {
    real = await realpath(abs);
  } catch {
    throw new Error(`file not found: ${file}`);
  }
  const roots = await Promise.all([...policy.allowedPaths, ...policy.rootPaths].map((p) => realpath(p).catch(() => resolve(p))));
  const inside = roots.some((root) => real === root || real.startsWith(root.endsWith(sep) ? root : root + sep));
  if (!inside) {
    throw new Error(`${file} is outside the allowed directories (${roots.join(", ")}); open its folder in the editor or start lacspace-mcp with --allow-path <dir>`);
  }
  return real;
}
