import type { Caption, PresetName, TimelineSpec } from "@lacspace/montage";
import { DataCard } from "./cards.js";

export interface VideoOptions {
  /** Rendered card image paths (PNG), one per DataCard, in order. */
  images: string[];
  /** Devanagari-capable font file for captions. */
  fontFile: string;
  output: string;
  preset?: PresetName;
  /** Seconds each card stays on screen (default 4). */
  perCard?: number;
  /** Brand sting clip to open with (path) + its duration. */
  sting?: { src: string; duration: number };
  /** Pre-mixed audio from @lacspace/audiomix. */
  audio?: string;
  /** Caption language (default "en"). */
  lang?: "en" | "ne";
  logo?: string;
}

/**
 * Turn rendered data cards into a 10–15 s montage: optional brand sting, each card with a gentle
 * Ken Burns, crossfades, and the card caption as a kinetic lower caption. Returns a montage
 * TimelineSpec — feed it to buildMontage/runMontage.
 */
export function toMontage(cards: DataCard[], o: VideoOptions): TimelineSpec {
  if (cards.length !== o.images.length) throw new Error("datacards: images.length must match cards.length");
  const per = o.perCard ?? 4;
  const segments: TimelineSpec["segments"] = [];
  const captions: Caption[] = [];
  let t = 0;
  if (o.sting) {
    segments.push({ kind: "clip", src: o.sting.src, duration: o.sting.duration });
    t += o.sting.duration;
  }
  cards.forEach((c, i) => {
    segments.push({ kind: "still", src: o.images[i]!, duration: per, kenBurns: i % 2 ? "out" : "in" });
    const text = (o.lang === "ne" ? c.caption.ne : c.caption.en).slice(0, 140);
    captions.push({ text, start: t + 0.4, end: t + per - 0.3, position: "bottom", box: true, kinetic: true });
    t += per;
  });
  return {
    preset: o.preset ?? "fb-feed",
    segments,
    transitions: { type: "crossfade", duration: 0.4 },
    captions,
    fontFile: o.fontFile,
    audio: o.audio,
    logo: o.logo ? { src: o.logo, corner: "top-right" } : undefined,
    output: o.output,
  };
}
