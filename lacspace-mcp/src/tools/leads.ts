/** find_leads — lacspace-leads, loaded on first use (it needs a Chromium). */
import type { ToolDefinition } from "../server";
import { clip } from "../format";

type Lead = Record<string, unknown> & { name?: string; phone?: string; website?: string; address?: string; rating?: number; reviews?: number };
type ScrapeLeads = (opts: Record<string, unknown>) => Promise<Lead[]>;

export interface LeadsDeps {
  load?: () => Promise<{ scrapeLeads: ScrapeLeads }>;
}

export function findLeadsTool(deps: LeadsDeps = {}): ToolDefinition<{ type: string; city?: string; area?: string; query?: string; limit: number; details: boolean }> {
  const load = deps.load ?? (async () => (await import("lacspace-leads")) as unknown as { scrapeLeads: ScrapeLeads });
  return {
    name: "find_leads",
    title: "Find business leads on Google Maps",
    description:
      "Search Google Maps for businesses of a type in a city or area and return name, rating, reviews, address, phone and website, plus email and social links when the site lists them. Keyless, but it drives a local Chromium (Chrome or Playwright's browser must be installed). Slow: about 30 seconds per 10 leads with details; set details=false for a names-only list in a few seconds. Use it for lead lists and local market research.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", description: "Business type, e.g. \"dentist\", \"coffee shop\", \"web agency\"." },
        city: { type: "string", description: "City, e.g. \"Berlin\"." },
        area: { type: "string", description: "Neighbourhood or district within the city." },
        query: { type: "string", description: "Free-form query instead of type + city." },
        limit: { type: "integer", minimum: 1, maximum: 120, default: 10 },
        details: { type: "boolean", default: true, description: "Open each listing for phone, website, email and socials. false = names only, much faster." },
      },
      required: ["type"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: { count: { type: "integer" }, leads: { type: "array", items: { type: "object" } } },
      required: ["count", "leads"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
    async run(args, ctx) {
      if (args.details && args.limit > 30 && !(await ctx.confirm(`Search ${args.limit} leads with details? About ${Math.round(args.limit * 3 / 60)} minutes in a local browser.`))) {
        return { text: "Lead search cancelled by the user.", isError: true };
      }
      let lib: { scrapeLeads: ScrapeLeads };
      try {
        lib = await load();
      } catch (err) {
        return { text: `find_leads is unavailable: lacspace-leads could not be loaded (${err instanceof Error ? err.message : String(err)}). Install it next to lacspace-mcp: npm i -g lacspace-leads`, isError: true };
      }
      let leads: Lead[];
      try {
        let found = 0;
        leads = await lib.scrapeLeads({
          type: args.type, city: args.city, area: args.area, query: args.query, limit: args.limit, details: args.details,
          cleanUrls: true, dedupe: "smart", headless: true, signal: ctx.signal,
          onLead: (lead: Lead) => { found++; ctx.progress(found, args.limit, lead.name ? `found ${lead.name}` : undefined); },
          onProgress: (message: string) => ctx.progress(found, args.limit, message),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const browser = /executable|browser|chromium|launch/i.test(message);
        return {
          text: `find_leads failed: ${message}` + (browser ? "\n\nNo browser was found. Install one with: npx playwright install chromium   (or install Google Chrome)" : ""),
          isError: true,
        };
      }
      const rows = leads.map((l) => [l.name, l.rating !== undefined ? `${l.rating}★ (${l.reviews ?? 0})` : undefined, l.phone, l.website, l.address].filter(Boolean).join(" | "));
      const text = `${leads.length} lead(s) for "${args.type}" ${args.city ? "in " + args.city : args.query ?? ""}\n\n` + rows.map((r) => `- ${r}`).join("\n");
      return { text: clip(text, 60_000).text, data: { count: leads.length, leads } };
    },
  };
}
