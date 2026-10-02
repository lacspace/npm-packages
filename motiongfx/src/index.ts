import { escapeDrawtext, escapePath, PRESETS, resolvePreset } from "@lacspace/montage";
import type { PresetInfo, PresetName } from "@lacspace/montage";

const VERSION = "1.0.0";

export type Urgency = "normal" | "developing" | "breaking";
export type Category = "politics" | "economy" | "sports" | "weather" | "tech" | "entertainment" | "health" | "world" | "local" | "explainer" | string;

/** A brand palette; category accents fall back to these. */
export interface Brand {
  primary: string; // "#C8102E"
  secondary?: string; // "#0B1F3A"
  ink?: string; // "#111111"
  paper?: string; // "#FFFFFF"
  fontFile: string;
  /** Devanagari font if different. */
  fontFileNe?: string;
  logo?: string;
}

/** Category → accent colour (conventional newsroom coding; override via brand.categoryColors). */
export const CATEGORY_COLORS: Record<string, string> = {
  politics: "#C8102E", economy: "#0E7C3A", sports: "#1D4ED8", weather: "#0891B2", tech: "#6D28D9",
  entertainment: "#DB2777", health: "#059669", world: "#374151", local: "#B45309", explainer: "#0F766E",
};

export function accentFor(category: Category | undefined, brand: Brand, urgency: Urgency = "normal"): string {
  if (urgency === "breaking") return brand.primary;
  return (category && CATEGORY_COLORS[category]) || brand.primary;
}

const DEV = /[ऀ-ॿ]/;
function font(brand: Brand, text: string): string {
  return escapePath(DEV.test(text) && brand.fontFileNe ? brand.fontFileNe : brand.fontFile);
}
function col(c: string, alpha?: number): string {
  const hex = c.startsWith("#") ? "0x" + c.slice(1) : c;
  return alpha !== undefined ? `${hex}@${alpha}` : hex;
}
function enable(start: number, end: number): string {
  return `enable='between(t,${start},${end})'`;
}
/** Eased 0→1 over `dur` seconds from `start` (smoothstep), clamped. */
function ease(start: number, dur: number): string {
  const u = `min(1,max(0,(t-${start})/${dur}))`;
  return `(${u}*${u}*(3-2*${u}))`;
}
/** Eased 1→0 into `end` over `dur`. */
function easeOut(end: number, dur: number): string {
  const u = `min(1,max(0,(${end}-t)/${dur}))`;
  return `(${u}*${u}*(3-2*${u}))`;
}

export interface LowerThirdOptions {
  title: string;
  subtitle?: string;
  start: number;
  end: number;
  category?: Category;
  urgency?: Urgency;
  /** "slide" (default): band slides in from the left; "wipe": accent bar grows then text fades; "pop": scale-free fade+rise. */
  animation?: "slide" | "wipe" | "pop";
  position?: "bottom" | "top";
  /** Band height px (default 150 at 1080 wide; scales with preset width). */
  height?: number;
}

/**
 * Animated lower-third: accent tab + translucent band + title/subtitle, slide/wipe/pop entry and a
 * mirrored exit, safe-area aware. Returns drawbox/drawtext filters in order (append to a chain).
 */
export function lowerThird(o: LowerThirdOptions, brand: Brand, preset: PresetName | PresetInfo): string[] {
  const p = resolvePreset(preset);
  const s = Math.min(p.width, p.height) / 1080; // scale by the short side so overlays suit 16:9 and 9:16 alike
  const h = Math.round((o.height ?? 150) * s);
  const accent = accentFor(o.category, brand, o.urgency);
  const inDur = 0.35, outDur = 0.3;
  const yBase = o.position === "top" ? p.safe.top : p.height - p.safe.bottom - h;
  const x0 = p.safe.left;
  const bandW = Math.min(p.width - p.safe.left - p.safe.right, Math.round(760 * s));
  const en = enable(o.start, o.end);
  const anim = o.animation ?? "slide";
  // Progress: eased in at start, eased out at end.
  const prog = `(${ease(o.start, inDur)}*${easeOut(o.end, outDur)})`;
  const filters: string[] = [];
  const tab = Math.round(14 * s);
  if (anim === "slide") {
    // Band x slides from -bandW to x0.
    const bx = `(${x0}-${bandW}*(1-${prog}))`;
    filters.push(`drawbox=x='${bx}':y=${yBase}:w=${bandW}:h=${h}:color=${col(brand.secondary ?? "#000000", 0.72)}:t=fill:${en}`);
    filters.push(`drawbox=x='${bx}':y=${yBase}:w=${tab}:h=${h}:color=${col(accent)}:t=fill:${en}`);
    filters.push(text(o.title, brand, Math.round(52 * s), `'(${bx})+${tab + Math.round(28 * s)}'`, `${yBase + Math.round(26 * s)}`, "white", en));
    if (o.subtitle) filters.push(text(o.subtitle, brand, Math.round(32 * s), `'(${bx})+${tab + Math.round(28 * s)}'`, `${yBase + Math.round(92 * s)}`, "white@0.85", en));
  } else if (anim === "wipe") {
    // Accent bar grows across, then band + text fade in.
    filters.push(`drawbox=x=${x0}:y=${yBase}:w='${bandW}*${prog}':h=${tab}:color=${col(accent)}:t=fill:${en}`);
    const fade = `${ease(o.start + 0.15, inDur)}*${easeOut(o.end, outDur)}`;
    filters.push(`drawbox=x=${x0}:y=${yBase + tab}:w=${bandW}:h=${h - tab}:color=${col(brand.secondary ?? "#000000", 0.72)}:t=fill:${enable(o.start + 0.15, o.end)}`);
    filters.push(text(o.title, brand, Math.round(52 * s), `${x0 + Math.round(28 * s)}`, `${yBase + tab + Math.round(22 * s)}`, "white", enable(o.start + 0.15, o.end), fade));
    if (o.subtitle) filters.push(text(o.subtitle, brand, Math.round(32 * s), `${x0 + Math.round(28 * s)}`, `${yBase + tab + Math.round(88 * s)}`, "white@0.85", enable(o.start + 0.15, o.end), fade));
  } else {
    // pop: fade + rise 24px.
    const y = `(${yBase}+${Math.round(24 * s)}*(1-${prog}))`;
    filters.push(`drawbox=x=${x0}:y='${y}':w=${bandW}:h=${h}:color=${col(brand.secondary ?? "#000000", 0.72)}:t=fill:${en}`);
    filters.push(`drawbox=x=${x0}:y='${y}':w=${tab}:h=${h}:color=${col(accent)}:t=fill:${en}`);
    filters.push(text(o.title, brand, Math.round(52 * s), `${x0 + tab + Math.round(28 * s)}`, `'(${y})+${Math.round(26 * s)}'`, "white", en, prog));
    if (o.subtitle) filters.push(text(o.subtitle, brand, Math.round(32 * s), `${x0 + tab + Math.round(28 * s)}`, `'(${y})+${Math.round(92 * s)}'`, "white@0.85", en, prog));
  }
  return filters;
}

function text(t: string, brand: Brand, size: number, x: string, y: string, color: string, en: string, alpha?: string): string {
  const a = alpha ? `:alpha='${alpha}'` : "";
  return `drawtext=fontfile='${font(brand, t)}':text='${escapeDrawtext(t)}':fontsize=${size}:fontcolor=${color}:x=${x}:y=${y}${a}:${en}`;
}

export interface StingerOptions {
  /** "BREAKING" / "ताजा खबर" / "LIVE" … */
  label: string;
  start: number;
  /** Seconds on screen (default 2.5). */
  duration?: number;
  urgency?: Urgency;
  category?: Category;
  /** "bar" (default): full-width band drops from the top; "flash": white flash then label; "corner": pinned badge. */
  style?: "bar" | "flash" | "corner";
}

/** Breaking/developing stinger — an attention band that drops in, holds, and lifts out. */
export function stinger(o: StingerOptions, brand: Brand, preset: PresetName | PresetInfo): string[] {
  const p = resolvePreset(preset);
  const s = Math.min(p.width, p.height) / 1080; // scale by the short side so overlays suit 16:9 and 9:16 alike
  const dur = o.duration ?? 2.5;
  const end = o.start + dur;
  const accent = accentFor(o.category, brand, o.urgency ?? "breaking");
  const en = enable(o.start, end);
  const h = Math.round(110 * s);
  const prog = `(${ease(o.start, 0.25)}*${easeOut(end, 0.25)})`;
  const f: string[] = [];
  if (o.style === "flash") {
    f.push(`drawbox=x=0:y=0:w=iw:h=ih:color=white@0.9:t=fill:enable='between(t,${o.start},${o.start + 0.12})'`);
    f.push(`drawbox=x=0:y=${p.safe.top}:w=iw:h=${h}:color=${col(accent, 0.95)}:t=fill:${enable(o.start + 0.1, end)}`);
    f.push(text(o.label.toUpperCase(), brand, Math.round(60 * s), "(w-text_w)/2", `${p.safe.top + Math.round(22 * s)}`, "white", enable(o.start + 0.1, end)));
  } else if (o.style === "corner") {
    const w = Math.round(300 * s);
    f.push(`drawbox=x=${p.safe.left}:y=${p.safe.top}:w=${w}:h=${Math.round(64 * s)}:color=${col(accent)}:t=fill:${en}`);
    f.push(text(o.label.toUpperCase(), brand, Math.round(34 * s), `${p.safe.left + Math.round(18 * s)}`, `${p.safe.top + Math.round(14 * s)}`, "white", en, `if(lt(mod(t,1),0.5),1,0.85)`));
  } else {
    // bar: drops from above the top safe edge into place.
    const y = `(${p.safe.top}-${h}*(1-${prog}))`;
    f.push(`drawbox=x=0:y='${y}':w=iw:h=${h}:color=${col(accent, 0.95)}:t=fill:${en}`);
    f.push(text(o.label.toUpperCase(), brand, Math.round(60 * s), "(w-text_w)/2", `'(${y})+${Math.round(22 * s)}'`, "white", en));
  }
  return f;
}

export interface TickerOptions {
  items: string[];
  start: number;
  end: number;
  /** Pixels per second (default 140 at 1080 wide). */
  speed?: number;
  category?: Category;
  urgency?: Urgency;
  /** Label at the left edge ("LIVE", "ताजा"). */
  label?: string;
}

/** Scrolling news ticker along the bottom safe edge, items separated by " • ". */
export function ticker(o: TickerOptions, brand: Brand, preset: PresetName | PresetInfo): string[] {
  const p = resolvePreset(preset);
  const s = Math.min(p.width, p.height) / 1080; // scale by the short side so overlays suit 16:9 and 9:16 alike
  const h = Math.round(64 * s);
  const y = p.height - p.safe.bottom - h;
  const speed = (o.speed ?? 140) * s;
  const en = enable(o.start, o.end);
  const txt = o.items.join("   •   ");
  const f: string[] = [];
  f.push(`drawbox=x=0:y=${y}:w=iw:h=${h}:color=${col(brand.ink ?? "#000000", 0.85)}:t=fill:${en}`);
  f.push(`drawtext=fontfile='${font(brand, txt)}':text='${escapeDrawtext(txt)}':fontsize=${Math.round(34 * s)}:fontcolor=white:y=${y + Math.round(15 * s)}:x='w-mod((t-${o.start})*${speed},w+text_w)':${en}`);
  if (o.label) {
    const lw = Math.round(170 * s);
    f.push(`drawbox=x=0:y=${y}:w=${lw}:h=${h}:color=${col(accentFor(o.category, brand, o.urgency))}:t=fill:${en}`);
    f.push(text(o.label.toUpperCase(), brand, Math.round(32 * s), `${Math.round(20 * s)}`, `${y + Math.round(15 * s)}`, "white", en));
  }
  return f;
}

export interface StingOptions {
  logo: string;
  output: string;
  preset?: PresetName | PresetInfo;
  /** Seconds (default 1.6). */
  duration?: number;
  /** Background colour (default brand.secondary or primary). */
  background?: string;
  /** Optional tagline under the logo. */
  tagline?: string;
  fps?: number;
}

/**
 * Brand sting: logo scales in with an eased zoom + fade over a brand colour, optional tagline fades
 * in, then everything fades out. Pure ffmpeg args (render once, reuse as a clip segment in montage).
 */
export function brandSting(o: StingOptions, brand: Brand): { args: string[]; duration: number } {
  const p = resolvePreset(o.preset ?? "landscape");
  const d = o.duration ?? 1.6;
  const fps = o.fps ?? 30;
  const bg = (o.background ?? brand.secondary ?? brand.primary).replace("#", "0x");
  const logoW = Math.round(p.width * 0.28);
  const zoom = `1.15-0.15*${ease(0, 0.6)}`; // 1.15 → 1.0
  const filter = [
    `color=c=${bg}:s=${p.width}x${p.height}:r=${fps}:d=${d}[bg]`,
    `[1:v]scale=${logoW}:-1,format=rgba,fade=t=in:st=0:d=0.3:alpha=1,fade=t=out:st=${(d - 0.35).toFixed(2)}:d=0.35:alpha=1[lg]`,
    `[bg][lg]overlay=x='(W-w*(${zoom}))/2':y='(H-h*(${zoom}))/2 - ${o.tagline ? Math.round(p.height * 0.04) : 0}':eval=frame[v1]`,
    o.tagline
      ? `[v1]drawtext=fontfile='${font(brand, o.tagline)}':text='${escapeDrawtext(o.tagline)}':fontsize=${Math.round(p.width * 0.03)}:fontcolor=white:x=(w-text_w)/2:y=h/2+${Math.round(p.height * 0.12)}:alpha='${ease(0.45, 0.3)}*${easeOut(d, 0.35)}'[vout]`
      : `[v1]null[vout]`,
  ].join(";");
  const args = ["-y", "-f", "lavfi", "-i", `color=c=${bg}:s=${p.width}x${p.height}:r=${fps}:d=${d}`, "-loop", "1", "-t", String(d), "-i", o.logo,
    "-filter_complex", filter, "-map", "[vout]", "-r", String(fps), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "18", "-an", "-movflags", "+faststart", o.output];
  return { args, duration: d };
}

export interface ShortsOptions {
  /** Where the 16:9 picture sits in the 9:16 frame: "center" (default) or "top" (leaves room for captions below). */
  placement?: "center" | "top";
  /** Blur sigma for the fill (default 30). */
  blur?: number;
  /** Target preset (default "shorts"). */
  preset?: PresetName | PresetInfo;
  /** Darken the blurred fill 0–1 (default 0.35). */
  dim?: number;
}

/**
 * Auto-shorts: turn a landscape frame into a 9:16 frame without a separate decode — the picture is
 * fitted by width and a blurred, dimmed copy fills the rest (the standard "vertical from horizontal"
 * look). Returns a filter chain `[in] … [out]`; captions then go in the free band under the picture.
 */
export function shortsFromLandscape(inLabel: string, outLabel: string, o: ShortsOptions = {}): { filter: string; picture: { x: number; y: number; w: number; h: number } } {
  const p = resolvePreset(o.preset ?? "shorts");
  const picH = Math.round((p.width * 9) / 16);
  const y = o.placement === "top" ? p.safe.top + Math.round(p.height * 0.06) : Math.round((p.height - picH) / 2);
  const dim = o.dim ?? 0.35;
  const filter = [
    `[${inLabel}]split=2[bgsrc][fg]`,
    `[bgsrc]scale=${p.width}:${p.height}:force_original_aspect_ratio=increase,crop=${p.width}:${p.height},gblur=sigma=${o.blur ?? 30},colorlevels=rimax=${(1 - dim).toFixed(2)}:gimax=${(1 - dim).toFixed(2)}:bimax=${(1 - dim).toFixed(2)}[bg]`,
    `[fg]scale=${p.width}:${picH}[pic]`,
    `[bg][pic]overlay=x=0:y=${y}[${outLabel}]`,
  ].join(";");
  return { filter, picture: { x: 0, y, w: p.width, h: picH } };
}

/** Machine-readable descriptor for an AI "conductor". */
export function describe() {
  return {
    name: "@lacspace/motiongfx",
    version: VERSION,
    summary: "Animated news motion graphics as pure ffmpeg filters: lower-thirds (slide/wipe/pop) coloured by category/urgency, breaking stingers (bar/flash/corner), scrolling ticker, brand sting clip, and auto-shorts (16:9 → 9:16 with blurred fill). Plugs into @lacspace/montage chains.",
    presets: Object.keys(PRESETS),
    categories: Object.keys(CATEGORY_COLORS),
    commands: [
      { name: "lowerThird", input: { type: "object", properties: { title: { type: "string" }, subtitle: { type: "string" }, start: { type: "number" }, end: { type: "number" }, category: { type: "string" }, urgency: { enum: ["normal", "developing", "breaking"] }, animation: { enum: ["slide", "wipe", "pop"] }, position: { enum: ["bottom", "top"] }, brand: { type: "object" }, preset: { type: "string" } }, required: ["title", "start", "end", "brand", "preset"] }, output: "string[] ffmpeg filters" },
      { name: "stinger", input: { type: "object", properties: { label: { type: "string" }, start: { type: "number" }, duration: { type: "number" }, style: { enum: ["bar", "flash", "corner"] }, urgency: { type: "string" }, brand: { type: "object" }, preset: { type: "string" } }, required: ["label", "start", "brand", "preset"] }, output: "string[]" },
      { name: "ticker", input: { type: "object", properties: { items: { type: "array" }, start: { type: "number" }, end: { type: "number" }, label: { type: "string" }, speed: { type: "number" } }, required: ["items", "start", "end"] }, output: "string[]" },
      { name: "brandSting", input: { type: "object", properties: { logo: { type: "string" }, output: { type: "string" }, preset: { type: "string" }, duration: { type: "number" }, tagline: { type: "string" } }, required: ["logo", "output"] }, output: "{ args, duration }" },
      { name: "shortsFromLandscape", input: { type: "object", properties: { inLabel: { type: "string" }, outLabel: { type: "string" }, placement: { enum: ["center", "top"] }, blur: { type: "number" } }, required: ["inLabel", "outLabel"] }, output: "{ filter, picture }" },
    ],
  };
}
