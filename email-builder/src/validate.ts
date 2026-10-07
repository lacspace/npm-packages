import { isColor } from "./color";
import { isSafeUrl } from "./escape";
import { blockSchema } from "./schema";
import type { Block, BlockType, ValidationError, ValidationResult } from "./types";

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
}

const URL_MSG = "must be an http(s), mailto, tel or {{var}} URL";

/**
 * Check a document before saving or sending. Reports unknown block types,
 * missing required props, bad colours, unsafe URLs, duplicate ids, images
 * without alt, <script> in html blocks, and columns with 0 or more than 4
 * children. Brand problems are reported with blockId "brand".
 */
export function validate(doc: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const err = (blockId: string, message: string) => errors.push({ blockId, message });
  const d = (doc ?? {}) as Record<string, unknown>;
  const seen = new Set<string>();

  const brand = d.brand as Record<string, unknown> | undefined;
  if (brand !== undefined) {
    if (!brand || typeof brand !== "object") err("brand", "brand must be an object");
    else {
      if (typeof brand.name !== "string" || !brand.name.trim()) err("brand", "brand.name is required");
      const colors = brand.colors as Record<string, unknown> | undefined;
      for (const k of ["primary", "text", "muted", "background", "surface"]) {
        const v = colors?.[k];
        if (!isColor(v)) err("brand", `brand.colors.${k} is not a valid colour (${String(v)})`);
      }
      if (brand.logoUrl !== undefined && brand.logoUrl !== "" && !isSafeUrl(brand.logoUrl)) err("brand", `brand.logoUrl ${URL_MSG}`);
      if (Array.isArray(brand.socials)) {
        brand.socials.forEach((s, i) => {
          const url = (s as Record<string, unknown> | null)?.url;
          if (!isSafeUrl(url)) err("brand", `brand.socials[${i}].url ${URL_MSG}`);
        });
      }
    }
  }

  const visit = (b: unknown, path: string) => {
    if (!b || typeof b !== "object") {
      err(path, "block must be an object");
      return;
    }
    const block = b as Block;
    const id = typeof block.id === "string" ? block.id : "";
    const label = id || path;
    if (!id) err(path, "block is missing an id");
    else if (seen.has(id)) err(id, `duplicate block id "${id}"`);
    else seen.add(id);

    const spec = blockSchema[block.type as BlockType];
    if (!spec || !Object.prototype.hasOwnProperty.call(blockSchema, block.type)) {
      err(label, `unknown block type "${String(block.type)}"`);
      return;
    }
    const props = (block.props && typeof block.props === "object" ? block.props : {}) as Record<string, unknown>;
    if (block.props !== undefined && (typeof block.props !== "object" || block.props === null)) err(label, "props must be an object");

    for (const [key, ps] of Object.entries(spec.props)) {
      const v = props[key];
      if (isEmpty(v)) {
        if (ps.required && ps.default === undefined) err(label, `missing required prop "${key}"`);
        continue;
      }
      switch (ps.type) {
        case "color":
          if (!isColor(v)) err(label, `${key} is not a valid colour (${String(v)})`);
          break;
        case "url":
          if (!isSafeUrl(v)) err(label, `${key} ${URL_MSG}`);
          break;
        case "number": {
          const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
          if (!Number.isFinite(n)) err(label, `${key} must be a number`);
          break;
        }
        case "boolean":
          if (typeof v !== "boolean" && v !== "true" && v !== "false") err(label, `${key} must be true or false`);
          break;
        case "select":
          if (ps.options && !ps.options.includes(String(v))) err(label, `${key} must be one of ${ps.options.join(", ")}`);
          break;
        default:
          break;
      }
    }

    if (block.type === "image") {
      const decorative = props.decorative === true || props.decorative === "true";
      if (!decorative && isEmpty(props.alt)) err(label, "image needs alt text (or set decorative: true)");
    }
    if (block.type === "html" && /<\s*script\b/i.test(String(props.html ?? ""))) {
      err(label, "html block must not contain <script>");
    }
    if (block.type === "social" && Array.isArray(props.links)) {
      props.links.forEach((l, i) => {
        if (!isSafeUrl((l as Record<string, unknown> | null)?.url)) err(label, `links[${i}].url ${URL_MSG}`);
      });
    }
    if (block.type === "columns") {
      const n = Array.isArray(block.children) ? block.children.length : 0;
      if (n === 0) err(label, "columns block needs 1 to 4 children (it has 0)");
      else if (n > 4) err(label, `columns block needs 1 to 4 children (it has ${n})`);
      const r = props.ratios;
      if (!isEmpty(r)) {
        const arr = Array.isArray(r) ? r.map(Number) : String(r).split(/[,:\s]+/).filter(Boolean).map(Number);
        if (arr.some((x) => !Number.isFinite(x) || x <= 0)) err(label, "ratios must be positive numbers");
        else if (n > 0 && arr.length !== n) err(label, `ratios has ${arr.length} values but there are ${n} columns`);
      }
    }
    if (block.children !== undefined) {
      if (!Array.isArray(block.children)) err(label, "children must be an array");
      else block.children.forEach((c, i) => visit(c, `${label}.children[${i}]`));
    }
  };

  if (!Array.isArray(d.blocks)) err("", "doc.blocks must be an array");
  else d.blocks.forEach((b, i) => visit(b, `blocks[${i}]`));

  return { ok: errors.length === 0, errors };
}
