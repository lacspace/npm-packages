import type { ToolDefinition } from "../server";
import { crawlSiteTool, fetchPageTool, scrapeTool } from "./web";
import { extractDocumentTool } from "./document";
import { auditPageTool } from "./audit";
import { enrichDomainTool } from "./domain";
import { checkSiteTool } from "./site";
import { validateEmailTool } from "./email";
import { findLeadsTool, type LeadsDeps } from "./leads";

export interface ToolDeps {
  leads?: LeadsDeps;
}

/** Every tool, in the order clients list them. */
export function createTools(deps: ToolDeps = {}): ToolDefinition[] {
  return [
    fetchPageTool, scrapeTool, crawlSiteTool, extractDocumentTool, auditPageTool,
    enrichDomainTool, checkSiteTool, validateEmailTool, findLeadsTool(deps.leads),
  ] as ToolDefinition[];
}

export const TOOL_NAMES = createTools().map((t) => t.name);
