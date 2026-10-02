export interface ImagePromptRequest {
  /** What to illustrate (a concept/scene — NOT a real person or real event photo). */
  subject: string;
  /** Illustration style hint (e.g. "flat vector", "paper-cut", "isometric"). */
  style?: string;
  /** Accent/brand colors to steer palette. */
  palette?: string[];
  aspect?: "portrait" | "square" | "landscape";
}

export interface ImagePromptResult {
  prompt: string;
  negativePrompt: string;
  /** The label that MUST be shown on the output. */
  label: "AI illustration";
}

export interface ImagePromptRefusal {
  refused: true;
  reason: string;
}

// Cues that a caller is asking for a photoreal depiction (of real people/events) — the
// one thing this helper will not produce for a newsroom.
const PHOTOREAL = /\b(photo(graph)?(realistic)?|realistic photo|lifelike|hyperrealistic|deepfake|real footage|actual photo)\b/i;
// Cues that the subject names a real, identifiable person or a specific real event.
const REAL_PERSON = /\b(president|prime minister|minister|pm|mp|ceo|celebrity|actor|politician|leader)\b/i;

/**
 * Turn a concept into a safe prompt for an image model. It ALWAYS produces a non-photoreal
 * ILLUSTRATION and labels the output "AI illustration". It REFUSES to help make a
 * photoreal image, or an image of a named real person / specific real event — newsrooms
 * must not pass synthetic imagery off as a real photo. Deterministic; no network.
 */
export function imagePrompt(req: ImagePromptRequest): ImagePromptResult | ImagePromptRefusal {
  const subject = (req.subject ?? "").trim();
  if (!subject) return { refused: true, reason: "empty subject" };

  const styleAsks = `${req.style ?? ""}`;
  if (PHOTOREAL.test(styleAsks) || PHOTOREAL.test(subject)) {
    return {
      refused: true,
      reason: "won't generate photoreal imagery — a news graphic must not look like a real photograph; use a clearly non-photoreal illustration style",
    };
  }
  if (REAL_PERSON.test(subject)) {
    return {
      refused: true,
      reason: "subject names a real public figure — don't synthesize images of identifiable real people for news; use a licensed photo or a generic, non-identifiable illustration",
    };
  }

  const style = req.style?.trim() || "clean flat vector editorial illustration";
  const palette = req.palette?.length ? `, palette ${req.palette.join(", ")}` : "";
  const aspect = req.aspect ?? "portrait";
  const prompt =
    `${style} of: ${subject}. Conceptual, non-photorealistic, editorial news graphic, ` +
    `simple shapes, generic non-identifiable figures only, no real logos or brands, ` +
    `no text, ${aspect} composition${palette}.`;
  const negativePrompt =
    "photorealistic, photograph, real person, identifiable face, celebrity, politician, " +
    "logo, brand, watermark, text, signature, gore, nsfw";
  return { prompt, negativePrompt, label: "AI illustration" };
}

export function isRefusal(r: ImagePromptResult | ImagePromptRefusal): r is ImagePromptRefusal {
  return (r as ImagePromptRefusal).refused === true;
}
