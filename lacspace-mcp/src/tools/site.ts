/** check_site — status, redirects, response time, TLS certificate. Node built-ins only. */
import { connect } from "node:tls";
import type { ToolDefinition } from "../server";
import { checkUrl } from "../guard";
import { lines } from "../format";

interface Hop { url: string; status: number; ms: number; location?: string }

async function tlsInfo(host: string, port: number, timeoutMs: number): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const socket = connect({ host, port, servername: host, timeout: timeoutMs }, () => {
      const cert = socket.getPeerCertificate();
      const validTo = cert.valid_to ? new Date(cert.valid_to) : undefined;
      const daysLeft = validTo ? Math.floor((validTo.getTime() - Date.now()) / 86_400_000) : undefined;
      resolve({
        authorized: socket.authorized, authorizationError: socket.authorized ? undefined : String(socket.authorizationError ?? ""),
        protocol: socket.getProtocol(), subject: cert.subject?.CN, issuer: cert.issuer?.O ?? cert.issuer?.CN,
        altNames: cert.subjectaltname, validFrom: cert.valid_from, validTo: cert.valid_to, daysLeft,
      });
      socket.end();
    });
    socket.on("error", (err) => resolve({ error: err.message }));
    socket.on("timeout", () => { socket.destroy(); resolve({ error: "TLS handshake timed out" }); });
  });
}

export const checkSiteTool: ToolDefinition<{ url: string; timeoutMs?: number }> = {
  name: "check_site",
  title: "Check a site's health",
  description:
    "Is the site up? Returns the HTTP status, the redirect chain, response time, server and caching headers, and for https the TLS certificate's issuer, expiry and days left. Use it for uptime questions and certificate checks.",
  inputSchema: {
    type: "object",
    properties: { url: { type: "string" }, timeoutMs: { type: "integer", minimum: 1000, maximum: 60_000 } },
    required: ["url"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  async run(args, ctx) {
    const timeoutMs = args.timeoutMs ?? Math.min(ctx.policy.timeoutMs, 15_000);
    let current = (await checkUrl(args.url, ctx.policy)).toString();
    const hops: Hop[] = [];
    let final: Response | undefined;
    let error: string | undefined;
    for (let i = 0; i < 6; i++) {
      const t0 = Date.now();
      try {
        const res = await fetch(current, { method: "GET", redirect: "manual", signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(timeoutMs)]), headers: { "user-agent": "lacspace-mcp/0.1 (+https://developer.lacspace.com/tools/mcp)" } });
        const ms = Date.now() - t0;
        const location = res.headers.get("location") ?? undefined;
        hops.push({ url: current, status: res.status, ms, location });
        if (res.status >= 300 && res.status < 400 && location) {
          await res.body?.cancel();
          current = new URL(location, current).toString();
          await checkUrl(current, ctx.policy);
          continue;
        }
        final = res;
        await res.body?.cancel();
        break;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        hops.push({ url: current, status: 0, ms: Date.now() - t0 });
        break;
      }
    }
    const last = hops[hops.length - 1]!;
    const u = new URL(last.url);
    const tls = u.protocol === "https:" ? await tlsInfo(u.hostname, Number(u.port) || 443, timeoutMs) : undefined;
    const up = !!final && final.status < 400;
    const data = {
      url: args.url, finalUrl: last.url, up, status: final?.status ?? 0, responseMs: hops.reduce((s, h) => s + h.ms, 0), hops, error,
      headers: final ? { server: final.headers.get("server"), contentType: final.headers.get("content-type"), cacheControl: final.headers.get("cache-control"), strictTransportSecurity: final.headers.get("strict-transport-security") } : undefined,
      tls,
    };
    const text = lines([
      ["URL", args.url], ["Up", up ? "yes" : "NO"], ["Status", final?.status], ["Error", error],
      ["Redirects", hops.length > 1 ? hops.slice(0, -1).map((h) => `${h.status} → ${h.location}`) : undefined],
      ["Final URL", last.url !== args.url ? last.url : undefined], ["Response time", `${data.responseMs} ms`],
      ["Server", data.headers?.server], ["Content-Type", data.headers?.contentType], ["HSTS", data.headers?.strictTransportSecurity],
      ["TLS", tls ? (tls.error ? `error: ${tls.error}` : `${tls.protocol}, issuer ${tls.issuer}, expires ${tls.validTo} (${tls.daysLeft} days left)${tls.authorized ? "" : ", NOT trusted: " + tls.authorizationError}`) : undefined],
    ]);
    return { text, data, isError: !up };
  },
};
