/** Orchestrator: brief → deterministic design choices → engine → finished SVG logo. */
import { tokenize, chooseMood, choosePalette, chooseFont, chooseIcon } from "./brief.js";
import { makeRng, resolveSeed } from "./rng.js";
import { initials, firstLetter } from "./text.js";
import { monogramMark, iconMark, abstractMark, emblemLogo, lettermarkMark } from "./engines.js";
import { compose, type Mark, type Spec } from "./render.js";
import type { Engine, Interpreted, Layout, LogoBrief, LogoResult, ShapeKind } from "./types.js";
import type { Rng } from "./rng.js";
import type { Mood } from "./types.js";

function chooseEngine(mood: Mood, rng: Rng, forced?: Engine): Engine {
  if (forced) return forced;
  return rng.pick(mood.engines);
}

function chooseLayout(mood: Mood, engine: Engine, rng: Rng, forced?: Layout): Layout {
  if (forced) return forced;
  if (engine === "emblem") return "emblem";
  const opts = mood.layouts.filter((l) => l !== "emblem");
  return opts.length ? rng.pick(opts) : "icon-left";
}

function markFor(engine: Engine, spec: Spec): Mark {
  switch (engine) {
    case "monogram":
      return monogramMark(spec);
    case "lettermark":
      return lettermarkMark(spec);
    case "abstract":
      return abstractMark(spec);
    case "emblem":
      return emblemLogo(spec);
    case "wordmark":
    default:
      return iconMark(spec);
  }
}

/** Generate a single deterministic logo from a brief. */
export function generateLogo(brief: LogoBrief): LogoResult {
  if (!brief.name || !brief.name.trim()) throw new Error("generateLogo: `name` is required.");
  const seed = resolveSeed(brief.seed, brief.name + "|" + (typeof brief.keywords === "string" ? brief.keywords : (brief.keywords || []).join(",")));
  const rng = makeRng(seed);
  const tokens = tokenize(brief);

  const mood = chooseMood(tokens, rng, brief.industry || brief.style);
  const palette = choosePalette(tokens, mood, rng, brief.palette);
  const font = chooseFont(mood, rng, brief.font);
  const iconDef = chooseIcon(tokens, rng, brief.icon);
  const engine = chooseEngine(mood, rng, brief.engine);
  const shape: ShapeKind = brief.shape ?? rng.pick(mood.shapes);
  const layout = chooseLayout(mood, engine, rng, brief.layout);

  let idc = 0;
  const uid = (p = "g") => `${p}${seed.toString(36)}${idc++}`;

  const spec: Spec = {
    name: brief.name.trim(),
    initials: initials(brief.name),
    letter: firstLetter(brief.name),
    palette,
    font,
    icon: iconDef,
    shape,
    layout,
    size: brief.size ?? 480,
    background: brief.background ?? "surface",
    rng,
    tokens,
    embedFont: true,
    uid,
  };

  const mark = markFor(engine, spec);
  const composed = compose(spec, mark);

  const notes: string[] = [
    `mood "${mood.name}"${tokens.length ? " from keywords" : " (default)"}`,
    `palette ${palette.name}`,
    `type ${font.display} / ${font.body}`,
    iconDef ? `icon "${iconDef.key}"` : `no icon match → ${engine} mark`,
    `engine ${engine}, layout ${layout}, shape ${shape}`,
  ];
  const interpreted: Interpreted = {
    keywords: tokens,
    mood: mood.id,
    iconKey: iconDef?.key,
    paletteId: palette.id,
    fontId: font.id,
    notes,
  };

  return {
    svg: composed.svg,
    width: composed.width,
    height: composed.height,
    engine,
    palette,
    font,
    icon: iconDef?.key,
    shape,
    layout,
    mood: mood.id,
    name: spec.name,
    seed,
    interpreted,
  };
}

/** Generate N reproducible variations of the same brief (the "concepts" grid). */
export function generateLogoSet(brief: LogoBrief, count = 12): LogoResult[] {
  const base = resolveSeed(brief.seed, brief.name);
  const out: LogoResult[] = [];
  for (let i = 0; i < count; i++) {
    out.push(generateLogo({ ...brief, seed: (base + i * 0x9e3779b1) >>> 0 }));
  }
  return out;
}

/** Interpret a brief WITHOUT rendering — see what the generator would choose. */
export function suggest(brief: LogoBrief): Interpreted {
  return generateLogo(brief).interpreted;
}
