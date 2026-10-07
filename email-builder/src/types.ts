export type BlockType =
  | "header"
  | "text"
  | "image"
  | "button"
  | "divider"
  | "spacer"
  | "columns"
  | "social"
  | "footer"
  | "html"
  | "quote"
  | "list"
  | "table";

export type Block = {
  id: string;
  type: BlockType;
  props: Record<string, unknown>;
  children?: Block[];
};

export type Brand = {
  name: string;
  logoUrl?: string;
  colors: { primary: string; text: string; muted: string; background: string; surface: string };
  font?: { family: string; fallback: string };
  radius?: number;
  address?: string;
  socials?: Array<{ kind: string; url: string }>;
};

export type EmailDoc = {
  blocks: Block[];
  brand: Brand;
  preheader?: string;
  /** Container width in px. Default 600. */
  width?: number;
};

export type RenderOptions = {
  /** "auto" (default) adds prefers-color-scheme / Outlook.com dark styles; "off" forces light. */
  darkMode?: "auto" | "off";
  /** Accepted for API compatibility. Critical styles are always written inline. */
  inlineCss?: true;
};

export type RenderResult = {
  html: string;
  text: string;
  warnings: string[];
  /** UTF-8 byte length of `html`. */
  size: number;
};

export type ValidationError = { blockId: string; message: string };
export type ValidationResult = { ok: boolean; errors: ValidationError[] };

export type PropType = "string" | "number" | "color" | "url" | "boolean" | "richtext" | "select";

export type PropSpec = {
  type: PropType;
  options?: string[];
  default?: unknown;
  label?: string;
  required?: boolean;
};

export type BlockSpec = {
  label: string;
  props: Record<string, PropSpec>;
  acceptsChildren?: boolean;
};

export type StarterCategory = "sales" | "support" | "finance" | "newsletter" | "onboarding";

export type StarterTemplate = {
  id: string;
  name: string;
  category: StarterCategory;
  doc: { blocks: Block[]; preheader?: string };
};
