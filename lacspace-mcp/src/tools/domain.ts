/** enrich_domain — lacspace-enrich. */
import { enrichDomain, normalizeDomain } from "lacspace-enrich";
import type { ToolDefinition } from "../server";
import { checkUrl } from "../guard";
import { lines } from "../format";

export const enrichDomainTool: ToolDefinition<{ domain: string; dns: boolean; rdap: boolean; timeoutMs?: number }> = {
  name: "enrich_domain",
  title: "Enrich a company domain",
  description:
    "Build a profile of a company from its domain: name, description, logo, emails, phones, address, social links, technology stack, contact page, plus DNS signals (MX provider, SPF, DMARC) and RDAP registration data (registrar, creation date). Keyless. Use it for lead research or vendor due diligence.",
  inputSchema: {
    type: "object",
    properties: {
      domain: { type: "string", description: "A domain or URL, e.g. \"stripe.com\" or \"https://www.stripe.com/\"." },
      dns: { type: "boolean", default: true, description: "Look up MX/SPF/DMARC." },
      rdap: { type: "boolean", default: true, description: "Look up registration (RDAP)." },
      timeoutMs: { type: "integer", minimum: 1000, maximum: 120_000 },
    },
    required: ["domain"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  async run(args, ctx) {
    const domain = normalizeDomain(args.domain);
    await checkUrl(`https://${domain}/`, ctx.policy);
    const p = await enrichDomain(domain, { dns: args.dns, rdap: args.rdap, timeoutMs: args.timeoutMs ?? ctx.policy.timeoutMs });
    if (p.error && !p.name && !p.emails?.length) return { text: `enrich_domain failed for ${domain}: ${p.error}`, data: p as unknown as Record<string, unknown>, isError: true };
    const text = lines([
      ["Domain", p.domain], ["Name", p.name], ["Description", p.description], ["URL", p.url], ["Logo", p.logo],
      ["Emails", p.emails], ["Phones", p.phones], ["Address", p.address], ["Contact page", p.contactPage],
      ["Socials", p.socials ? Object.entries(p.socials).map(([k, v]) => `${k}: ${v}`) : undefined],
      ["Tech", p.tech],
      ["Mail provider", p.dns?.mailProvider], ["MX", p.dns?.mx?.map((m: { exchange: string }) => m.exchange)],
      ["SPF", p.dns?.spfPolicy], ["DMARC", p.dns?.dmarcPolicy],
      ["Registrar", p.registration?.registrar], ["Registered", p.registration?.createdAt], ["Expires", p.registration?.expiresAt],
      ["Error", p.error],
    ]);
    return { text, data: p as unknown as Record<string, unknown> };
  },
};
