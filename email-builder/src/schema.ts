import type { BlockSpec, BlockType, Brand } from "./types";

const ALIGN = ["left", "center", "right"];

/** Prop definitions per block type. Editors generate their forms from this. */
export const blockSchema: Record<BlockType, BlockSpec> = {
  header: {
    label: "Header",
    props: {
      align: { type: "select", options: ALIGN, default: "left", label: "Alignment" },
      logoWidth: { type: "number", default: 140, label: "Logo width (px)" },
      background: { type: "color", label: "Background colour" },
      textColor: { type: "color", label: "Name colour (when there is no logo)" },
    },
  },
  text: {
    label: "Text",
    props: {
      content: { type: "richtext", required: true, label: "Text" },
      variant: { type: "select", options: ["body", "h1", "h2", "h3", "small"], default: "body", label: "Style" },
      align: { type: "select", options: ALIGN, default: "left", label: "Alignment" },
      color: { type: "color", label: "Text colour" },
      fontSize: { type: "number", label: "Font size (px)" },
    },
  },
  image: {
    label: "Image",
    props: {
      src: { type: "url", required: true, label: "Image URL" },
      alt: { type: "string", label: "Alt text" },
      decorative: { type: "boolean", default: false, label: "Decorative (no alt text)" },
      width: { type: "number", label: "Width (px)" },
      href: { type: "url", label: "Link" },
      align: { type: "select", options: ALIGN, default: "center", label: "Alignment" },
    },
  },
  button: {
    label: "Button",
    props: {
      text: { type: "string", required: true, label: "Label" },
      url: { type: "url", required: true, label: "Link" },
      align: { type: "select", options: ALIGN, default: "center", label: "Alignment" },
      fullWidth: { type: "boolean", default: false, label: "Full width" },
      color: { type: "color", label: "Button colour" },
      textColor: { type: "color", default: "#ffffff", label: "Label colour" },
    },
  },
  divider: {
    label: "Divider",
    props: {
      color: { type: "color", label: "Colour" },
      thickness: { type: "number", default: 1, label: "Thickness (px)" },
    },
  },
  spacer: {
    label: "Spacer",
    props: {
      height: { type: "number", default: 24, label: "Height (px)" },
    },
  },
  columns: {
    label: "Columns",
    acceptsChildren: true,
    props: {
      ratios: { type: "string", label: "Ratios, e.g. 1,2 (number[] also accepted)" },
      gap: { type: "number", default: 16, label: "Gap (px)" },
      stackOnMobile: { type: "boolean", default: true, label: "Stack on mobile" },
    },
  },
  social: {
    label: "Social links",
    props: {
      iconBaseUrl: { type: "url", label: "Icon base URL ({base}/{kind}.png)" },
      align: { type: "select", options: ALIGN, default: "center", label: "Alignment" },
    },
  },
  footer: {
    label: "Footer",
    props: {
      unsubscribeUrl: { type: "url", default: "{{unsubscribeUrl}}", label: "Unsubscribe URL" },
      unsubscribeText: { type: "string", default: "Unsubscribe", label: "Unsubscribe label" },
      note: { type: "string", label: "Note (why they get this email)" },
      showSocials: { type: "boolean", default: true, label: "Show brand socials" },
      align: { type: "select", options: ALIGN, default: "center", label: "Alignment" },
    },
  },
  html: {
    label: "Custom HTML",
    props: {
      html: { type: "string", required: true, label: "Raw HTML" },
    },
  },
  quote: {
    label: "Quote",
    props: {
      content: { type: "richtext", required: true, label: "Quote" },
      cite: { type: "string", label: "Attribution" },
      borderColor: { type: "color", label: "Bar colour" },
    },
  },
  list: {
    label: "List",
    props: {
      items: { type: "string", required: true, label: "Items (one per line; string[] also accepted)" },
      ordered: { type: "boolean", default: false, label: "Numbered" },
    },
  },
  table: {
    label: "Table",
    props: {
      rows: { type: "string", required: true, label: "Rows (one per line, cells split by |; string[][] also accepted)" },
      headerRow: { type: "boolean", default: true, label: "First row is a header" },
      striped: { type: "boolean", default: false, label: "Striped rows" },
    },
  },
};

/** A neutral brand used for previews and starter checks. */
export const defaultBrand: Brand = {
  name: "Your Company",
  colors: {
    primary: "#2563eb",
    text: "#1f2937",
    muted: "#6b7280",
    background: "#f3f4f6",
    surface: "#ffffff",
  },
  radius: 6,
  address: "{{companyAddress}}",
  socials: [],
};
