import { PresetInfo } from "./presets.js";
import { color, escapeDrawtext, escapePath } from "./escape.js";
import { CaptionPosition, TransitionType } from "./types.js";

/** Scale-to-cover + crop a clip input to the canvas, normalize fps/sar/format. */
export function clipChain(inLabel: string, outLabel: string, p: PresetInfo, fps: number): string {
  return (
    `[${inLabel}]fps=${fps},scale=${p.width}:${p.height}:force_original_aspect_ratio=increase,` +
    `crop=${p.width}:${p.height},setsar=1,format=yuv420p[${outLabel}]`
  );
}

/** A still with a Ken Burns move via zoompan. */
export function stillChain(
  inLabel: string,
  outLabel: string,
  p: PresetInfo,
  fps: number,
  duration: number,
  motion: "in" | "out" | "none",
  oversample = 2,
): string {
  const frames = Math.max(1, Math.round(duration * fps));
  // Oversample so the zoom has pixels to work with; zoom from/to by motion. Step scales with fps so
  // the move covers the same distance at 24 or 30 fps.
  const step = (0.0012 * 30) / fps;
  const z =
    motion === "out"
      ? `z='if(eq(on,1),1.20,max(1.001,zoom-${step.toFixed(5)}))'`
      : motion === "in"
        ? `z='min(zoom+${step.toFixed(5)},1.20)'`
        : "z=1";
  const x = "x='iw/2-(iw/zoom/2)'";
  const y = "y='ih/2-(ih/zoom/2)'";
  return (
    `[${inLabel}]scale=${Math.round(p.width * oversample)}:${Math.round(p.height * oversample)},` +
    `zoompan=${z}:${x}:${y}:d=${frames}:s=${p.width}x${p.height}:fps=${fps},` +
    `setsar=1,format=yuv420p[${outLabel}]`
  );
}

const XFADE: Record<TransitionType, string> = {
  crossfade: "fade",
  slide: "slideleft",
  "zoom-punch": "zoomin",
  whip: "smoothleft",
};

export function xfadeName(t: TransitionType): string {
  return XFADE[t] ?? "fade";
}

/** y expression for a stacked text block at a safe-area-respecting position. */
export function yExpr(pos: CaptionPosition, p: PresetInfo, lineH: number): string {
  if (pos === "top") return `${p.safe.top}`;
  if (pos === "center") return `(h-${lineH})/2`;
  return `h-${p.safe.bottom}-${lineH}`; // bottom
}

export interface DrawtextOpts {
  text: string;
  fontFile: string;
  fontSize: number;
  fontColor: string;
  start: number;
  end: number;
  pos: CaptionPosition;
  preset: PresetInfo;
  box?: boolean;
  boxColor?: string;
  kinetic?: boolean;
}

/** A drawtext caption, optionally "kinetic" (fade + slide-up on entry). */
export function drawtext(o: DrawtextOpts): string {
  const baseY = yExpr(o.pos, o.preset, o.fontSize * 1.4);
  const enable = `enable='between(t,${o.start},${o.end})'`;
  // Kinetic: 0.3s fade-in and a 36px slide up as it appears.
  const alpha = o.kinetic
    ? `:alpha='if(lt(t,${o.start}+0.3),(t-${o.start})/0.3,1)'`
    : "";
  const y = o.kinetic
    ? `y='(${baseY})+36*(1-min(1,(t-${o.start})/0.3))'`
    : `y=${baseY}`;
  const parts = [
    `fontfile='${escapePath(o.fontFile)}'`,
    `text='${escapeDrawtext(o.text)}'`,
    `fontsize=${o.fontSize}`,
    `fontcolor=${color(o.fontColor)}`,
    `x=(w-text_w)/2`,
    y,
    o.box ? `box=1:boxcolor=${color(o.boxColor ?? "black@0.5")}:boxborderw=${Math.round(o.fontSize * 0.4)}` : "",
    "line_spacing=8",
    alpha ? alpha.slice(1) : "",
    enable,
  ].filter(Boolean);
  return `drawtext=${parts.join(":")}`;
}

/** A lower-third band (box) with a title and optional subtitle. */
export function lowerThird(
  o: { title: string; subtitle?: string; start: number; end: number; fontFile: string; preset: PresetInfo; accent?: string },
): string[] {
  const p = o.preset;
  const bandY = p.height - p.safe.bottom - 160;
  const enable = `enable='between(t,${o.start},${o.end})'`;
  const filters: string[] = [
    `drawbox=x=${p.safe.left}:y=${bandY}:w=${p.width - p.safe.left - p.safe.right}:h=140:` +
      `color=${color(o.accent ?? "black@0.55")}:t=fill:${enable}`,
    `drawtext=fontfile='${escapePath(o.fontFile)}':text='${escapeDrawtext(o.title)}':fontsize=52:` +
      `fontcolor=white:x=${p.safe.left + 28}:y=${bandY + 24}:${enable}`,
  ];
  if (o.subtitle) {
    filters.push(
      `drawtext=fontfile='${escapePath(o.fontFile)}':text='${escapeDrawtext(o.subtitle)}':fontsize=34:` +
        `fontcolor=white@0.85:x=${p.safe.left + 28}:y=${bandY + 88}:${enable}`,
    );
  }
  return filters;
}

/** libass burn-in of an ASS file (from @lacspace/captionsync). */
export function assFilter(file: string, fontsDir?: string): string {
  return `subtitles='${escapePath(file)}'${fontsDir ? `:fontsdir='${escapePath(fontsDir)}'` : ""}`;
}

/** Resize a canvas to another preset: scale-to-cover + centre crop. */
export function recanvas(inLabel: string, outLabel: string, to: PresetInfo): string {
  return `[${inLabel}]scale=${to.width}:${to.height}:force_original_aspect_ratio=increase,crop=${to.width}:${to.height},setsar=1[${outLabel}]`;
}

/** An animated progress bar pinned to the bottom edge. */
export function progressBar(p: PresetInfo, total: number, height: number, col: string): string {
  // Width grows linearly with playback time.
  return `drawbox=x=0:y=${p.height - height}:w='iw*t/${total}':h=${height}:color=${color(col)}:t=fill`;
}
