/**
 * @lacspace/analytics-lite — id generation.
 *
 * A CSPRNG-backed random id (Web Crypto when available) with a safe,
 * non-throwing fallback for environments without `crypto`. Zero dependencies,
 * isomorphic. Used as the default anonymous/session id for the lite client.
 */

/**
 * Generate a random hex id. Prefers `crypto.randomUUID`, then
 * `crypto.getRandomValues`, and finally a `Math.random` + time fallback so it
 * never throws on constrained runtimes.
 */
export function randomId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof (c as { randomUUID?: () => string }).randomUUID === "function") {
    return (c as { randomUUID: () => string }).randomUUID();
  }
  if (c && typeof c.getRandomValues === "function") {
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    let s = "";
    for (let i = 0; i < b.length; i++) s += (b[i]! + 0x100).toString(16).slice(1);
    return s;
  }
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}
