import { Cue, Layout, StyleOptions } from "./types.js";

function pad(n: number, w = 2): string { return String(n).padStart(w, "0"); }

/** ASS timestamp h:mm:ss.cc */
export function assTime(ms: number): string {
  const cs = Math.round(ms / 10);
  const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), s = Math.floor((cs % 6000) / 100), c = cs % 100;
  return `${h}:${pad(m)}:${pad(s)}.${pad(c)}`;
}
/** SRT timestamp hh:mm:ss,mmm */
export function srtTime(ms: number): string {
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), x = ms % 1000;
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(x, 3)}`;
}
export function vttTime(ms: number): string { return srtTime(ms).replace(",", "."); }

/** "#RRGGBB" or "#RRGGBB@alpha" → ASS &HAABBGGRR& (alpha 00 = opaque). */
export function assColor(c: string): string {
  const [hex, a] = c.split("@");
  const h = (hex ?? "#ffffff").replace("#", "").padEnd(6, "0");
  const r = h.slice(0, 2), g = h.slice(2, 4), b = h.slice(4, 6);
  const alpha = a !== undefined ? Math.round((1 - Number(a)) * 255) : 0;
  return `&H${alpha.toString(16).toUpperCase().padStart(2, "0")}${b}${g}${r}&`.toUpperCase().replace("&H", "&H");
}

function alignment(pos: Layout["position"]): number {
  return pos === "top" ? 8 : pos === "center" ? 5 : 2; // ASS numpad alignment, centred
}

function escAss(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\{/g, "(").replace(/\}/g, ")").replace(/\n/g, "\\N");
}

/** Karaoke tags per word: \k (per-word pop) or \kf (sweep). Durations in centiseconds. */
function karaokeLine(words: Cue["lines"][number]["words"], mode: "fill" | "word", cueStart: number): string {
  const tag = mode === "fill" ? "\\kf" : "\\k";
  let t = cueStart;
  const parts: string[] = [];
  for (const w of words) {
    const lead = Math.max(0, w.startMs - t);
    if (lead > 0) parts.push(`{${tag}${Math.round(lead / 10)}}`); // silent gap before the word
    parts.push(`{${tag}${Math.max(1, Math.round((w.endMs - w.startMs) / 10))}}${escAss(w.text)}`);
    t = w.endMs;
    parts.push(" ");
  }
  return parts.join("").trimEnd();
}

/**
 * Build an ASS (Advanced SubStation Alpha) file. libass shapes Devanagari with HarfBuzz, which is
 * why burn-in via `subtitles=` beats drawtext for Nepali. PlayRes = canvas, margins = safe area.
 */
export function toAss(layout: Layout, s: StyleOptions = {}): string {
  const { canvas, fontSize, position } = layout;
  const font = s.fontName ?? "Mukta";
  const box = (s.style ?? "box") === "box";
  const primary = assColor(s.primaryColor ?? "#FFFFFF");
  const secondary = assColor(s.highlightColor ?? "#FFD400");
  const outline = assColor(s.outlineColor ?? "#000000");
  const back = assColor(s.backColor ?? (box ? "#000000@0.55" : "#000000@0.6"));
  const borderStyle = box ? 3 : 1;
  const outlineW = s.outline ?? (box ? Math.round(fontSize * 0.3) : Math.round(fontSize * 0.08));
  const shadow = s.shadow ?? (box ? 0 : Math.round(fontSize * 0.06));
  const marginV = position === "top" ? canvas.safe.top : canvas.safe.bottom;
  const fade = s.fadeMs ?? 120;
  const karaoke = s.karaoke ?? "none";
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${canvas.width}`,
    `PlayResY: ${canvas.height}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // Karaoke: text starts in SecondaryColour and sweeps to PrimaryColour → swap so the highlight lands in the "sung" state.
    `Style: Caption,${font},${fontSize},${karaoke === "none" ? primary : secondary},${karaoke === "none" ? secondary : primary},${outline},${back},${s.bold === false ? 0 : -1},0,0,0,100,100,0,0,${borderStyle},${outlineW},${shadow},${alignment(position)},${canvas.safe.left},${canvas.safe.right},${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const events = layout.cues.map((c) => {
    const text = karaoke === "none"
      ? c.lines.map((l) => escAss(l.text)).join("\\N")
      : c.lines.map((l) => karaokeLine(l.words, karaoke, c.startMs)).join("\\N");
    const fx = fade ? `{\\fad(${fade},${fade})}` : "";
    return `Dialogue: 0,${assTime(c.startMs)},${assTime(c.endMs)},Caption,,0,0,0,,${fx}${text}`;
  });
  return [...header, ...events, ""].join("\n");
}

export function toSrt(layout: Layout): string {
  return layout.cues.map((c) => `${c.index}\n${srtTime(c.startMs)} --> ${srtTime(c.endMs)}\n${c.text}\n`).join("\n");
}

export function toVtt(layout: Layout): string {
  const pos = layout.position === "top" ? " line:5%" : layout.position === "center" ? " line:50%" : " line:90%";
  return "WEBVTT\n\n" + layout.cues.map((c) => `${c.index}\n${vttTime(c.startMs)} --> ${vttTime(c.endMs)}${pos} align:center\n${c.text}\n`).join("\n");
}

/** Escape a path for use inside an ffmpeg filter option (colons, quotes, backslashes, brackets). */
export function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/'/g, "'\\''").replace(/:/g, "\\:").replace(/\[/g, "\\[").replace(/\]/g, "\\]").replace(/,/g, "\\,");
}

/** ffmpeg filter that burns an ASS file in with libass (pass a fontsdir containing Mukta/Noto Sans Devanagari). */
export function assFilter(assPath: string, options: { fontsDir?: string } = {}): string {
  const parts = [`subtitles='${escapeFilterPath(assPath)}'`];
  if (options.fontsDir) parts.push(`fontsdir='${escapeFilterPath(options.fontsDir)}'`);
  return parts.join(":");
}

/** @lacspace/montage `Caption[]` fallback (drawtext) — one caption per cue, lines joined with \n. */
export function toMontageCaptions(layout: Layout): Array<{ text: string; start: number; end: number; position: Layout["position"]; fontSize: number; box: boolean; kinetic: boolean }> {
  return layout.cues.map((c) => ({ text: c.text, start: c.startMs / 1000, end: c.endMs / 1000, position: layout.position, fontSize: layout.fontSize, box: true, kinetic: true }));
}
