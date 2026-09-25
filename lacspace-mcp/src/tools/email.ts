/** validate_email — @lacspace/email-validate + @lacspace/email-verify. */
import { validateEmail } from "@lacspace/email-validate";
import { verifyEmail } from "@lacspace/email-verify";
import type { ToolDefinition } from "../server";
import { lines } from "../format";

export const validateEmailTool: ToolDefinition<{ email: string; checkMx: boolean }> = {
  name: "validate_email",
  title: "Validate an email address",
  description:
    "Check an email address: syntax, disposable/temporary provider, role account (info@, support@), free provider, a typo suggestion (gmial.com → gmail.com), the normalised form for de-duplication, and (with checkMx) whether the domain accepts mail. No email is sent.",
  inputSchema: {
    type: "object",
    properties: { email: { type: "string" }, checkMx: { type: "boolean", default: true, description: "Look up the domain's MX records." } },
    required: ["email"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  async run(args) {
    const v = validateEmail(args.email);
    let mx: { found: boolean; records: string[] } | undefined;
    if (v.valid && args.checkMx) {
      const r = await verifyEmail(args.email, { checkSmtp: false });
      mx = { found: r.mxFound, records: r.mxRecords.map((m) => m.exchange) };
    }
    const data = { ...v, mx };
    const text = lines([
      ["Email", args.email], ["Valid syntax", v.valid ? "yes" : `no (${v.reason ?? "invalid"})`], ["Normalised", v.normalized],
      ["Disposable", v.disposable ? "YES" : "no"], ["Role account", v.role ? "yes" : "no"], ["Free provider", v.free ? "yes" : "no"],
      ["Did you mean", v.suggestion],
      ["Domain accepts mail", mx ? (mx.found ? `yes (${mx.records.join(", ")})` : "NO (no MX records)") : undefined],
    ]);
    return { text, data: data as Record<string, unknown> };
  },
};
