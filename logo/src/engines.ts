/** The mark engines. Each returns a Mark (SVG body in a size×size box + defs). */
import type { Mark, Spec } from "./render.js";
import { shapeEl, iconEl, linearGradient } from "./shapes.js";
import { esc } from "./text.js";
import type { ShapeKind } from "./types.js";

const nn = (v: number) => Math.round(v * 100) / 100;
const inkFor = (spec: Spec) => (spec.background === "transparent" ? spec.palette.primary : spec.palette.on);

/** Monogram: initials on a gradient enclosure. */
export function monogramMark(spec: Spec): Mark {
  const s = spec.size;
  const gid = spec.uid("m");
  const defs = linearGradient(gid, spec.palette.from, spec.palette.to, spec.rng.int(30, 120));
  const shape: ShapeKind = spec.shape === "none" ? "squircle" : spec.shape;
  const fs = spec.initials.length >= 2 ? s * 0.42 : s * 0.54;
  const body =
    shapeEl(shape, s, `url(#${gid})`) +
    `<text x="${nn(s / 2)}" y="${nn(s / 2 + fs * 0.02)}" font-family="${spec.font.stack}" font-weight="${spec.font.weight}" font-size="${nn(fs)}" fill="${spec.palette.on}" text-anchor="middle" dominant-baseline="central">${esc(spec.initials)}</text>`;
  return { svg: body, size: s, defs };
}

/** Lettermark: one big display letter, filled with the brand gradient. */
export function lettermarkMark(spec: Spec): Mark {
  const s = spec.size;
  const gid = spec.uid("l");
  const defs = linearGradient(gid, spec.palette.from, spec.palette.to, spec.rng.int(20, 120));
  const enclosed = spec.shape !== "none" && spec.rng.chance(0.4);
  const fs = s * 0.86;
  let body = "";
  let fill = `url(#${gid})`;
  if (enclosed) {
    body += shapeEl(spec.shape, s, `url(#${gid})`);
    fill = spec.palette.on;
  }
  body += `<text x="${nn(s / 2)}" y="${nn(s / 2 + fs * 0.03)}" font-family="${spec.font.stack}" font-weight="${spec.font.weight}" font-size="${nn(fs)}" fill="${fill}" text-anchor="middle" dominant-baseline="central">${esc(spec.letter)}</text>`;
  return { svg: body, size: s, defs };
}

/** Icon mark: an icon glyph, optionally on a gradient enclosure. */
export function iconMark(spec: Spec): Mark {
  const s = spec.size;
  const gid = spec.uid("i");
  const defs = linearGradient(gid, spec.palette.from, spec.palette.to, spec.rng.int(30, 120));
  if (!spec.icon) return monogramMark(spec);
  if (spec.shape === "none") {
    const body = iconEl(spec.icon, s * 0.94, s / 2, s / 2, `url(#${gid})`, 2.1);
    return { svg: body, size: s, defs };
  }
  const body =
    shapeEl(spec.shape, s, `url(#${gid})`) +
    iconEl(spec.icon, s * 0.52, s / 2, s / 2, spec.palette.on, 2);
  return { svg: body, size: s, defs };
}

/** Geometric / abstract mark — seeded generative styles, no text. */
export function abstractMark(spec: Spec): Mark {
  const s = spec.size;
  const c = s / 2;
  const gid = spec.uid("a");
  const defs = linearGradient(gid, spec.palette.from, spec.palette.to, spec.rng.int(20, 140));
  const g = `url(#${gid})`;
  const styles = ["orbit", "venn", "arcs", "burst", "waves", "grid"] as const;
  const style = spec.rng.pick(styles);
  let body = "";

  if (style === "orbit") {
    const R = s * 0.34;
    body += `<circle cx="${nn(c)}" cy="${nn(c)}" r="${nn(R)}" fill="none" stroke="${g}" stroke-width="${nn(s * 0.035)}"/>`;
    body += `<circle cx="${nn(c)}" cy="${nn(c)}" r="${nn(s * 0.1)}" fill="${g}"/>`;
    const base = spec.rng.int(0, 360);
    for (let k = 0; k < 3; k++) {
      const a = ((base + k * 120) * Math.PI) / 180;
      const x = c + R * Math.cos(a);
      const y = c + R * Math.sin(a);
      body += `<circle cx="${nn(x)}" cy="${nn(y)}" r="${nn(s * 0.06)}" fill="${spec.palette.accent}"/>`;
      body += `<line x1="${nn(c)}" y1="${nn(c)}" x2="${nn(x)}" y2="${nn(y)}" stroke="${g}" stroke-width="${nn(s * 0.02)}" opacity="0.5"/>`;
    }
  } else if (style === "venn") {
    const r = s * 0.24;
    const off = s * 0.14;
    const centers = [
      [c - off, c - off * 0.4],
      [c + off, c - off * 0.4],
      [c, c + off],
    ];
    centers.forEach((p, i) => {
      body += `<circle cx="${nn(p[0]!)}" cy="${nn(p[1]!)}" r="${nn(r)}" fill="${i === 0 ? spec.palette.from : i === 1 ? spec.palette.to : spec.palette.accent}" opacity="0.75"/>`;
    });
  } else if (style === "arcs") {
    for (let i = 0; i < 3; i++) {
      const R = s * (0.16 + i * 0.11);
      const a0 = (spec.rng.int(0, 180) * Math.PI) / 180;
      const a1 = a0 + Math.PI * 1.3;
      const x0 = c + R * Math.cos(a0);
      const y0 = c + R * Math.sin(a0);
      const x1 = c + R * Math.cos(a1);
      const y1 = c + R * Math.sin(a1);
      body += `<path d="M ${nn(x0)} ${nn(y0)} A ${nn(R)} ${nn(R)} 0 1 1 ${nn(x1)} ${nn(y1)}" fill="none" stroke="${g}" stroke-width="${nn(s * 0.05)}" stroke-linecap="round"/>`;
    }
  } else if (style === "burst") {
    const spokes = spec.rng.int(6, 10);
    const base = spec.rng.int(0, 360);
    for (let k = 0; k < spokes; k++) {
      const a = ((base + (360 / spokes) * k) * Math.PI) / 180;
      const r0 = s * 0.12;
      const r1 = s * 0.4;
      body += `<line x1="${nn(c + r0 * Math.cos(a))}" y1="${nn(c + r0 * Math.sin(a))}" x2="${nn(c + r1 * Math.cos(a))}" y2="${nn(c + r1 * Math.sin(a))}" stroke="${g}" stroke-width="${nn(s * 0.035)}" stroke-linecap="round"/>`;
    }
    body += `<circle cx="${nn(c)}" cy="${nn(c)}" r="${nn(s * 0.09)}" fill="${spec.palette.accent}"/>`;
  } else if (style === "waves") {
    for (let i = 0; i < 3; i++) {
      const y = c - s * 0.14 + i * s * 0.14;
      const amp = s * 0.06;
      const d = `M ${nn(s * 0.14)} ${nn(y)} C ${nn(s * 0.32)} ${nn(y - amp)} ${nn(s * 0.42)} ${nn(y + amp)} ${nn(s * 0.5)} ${nn(y)} C ${nn(s * 0.58)} ${nn(y - amp)} ${nn(s * 0.68)} ${nn(y + amp)} ${nn(s * 0.86)} ${nn(y)}`;
      body += `<path d="${d}" fill="none" stroke="${g}" stroke-width="${nn(s * 0.045)}" stroke-linecap="round" opacity="${nn(1 - i * 0.22)}"/>`;
    }
  } else {
    // grid of dots forming a rounded square
    const n = 3;
    const gap = s * 0.2;
    const start = c - gap;
    for (let r = 0; r < n; r++) {
      for (let col = 0; col < n; col++) {
        const x = start + col * gap;
        const y = start + r * gap;
        const rad = s * 0.055 * (1 + ((r + col) % 2) * 0.4);
        body += `<circle cx="${nn(x)}" cy="${nn(y)}" r="${nn(rad)}" fill="${(r + col) % 2 ? spec.palette.accent : g}"/>`;
      }
    }
  }

  return { svg: body, size: s, defs };
}

/** Emblem: a seal/ring with an icon and the brand name curved along the bottom. */
export function emblemLogo(spec: Spec): Mark {
  const s = spec.size;
  const c = s / 2;
  const gid = spec.uid("e");
  const defs0 = linearGradient(gid, spec.palette.from, spec.palette.to, spec.rng.int(30, 120));
  const g = `url(#${gid})`;
  const ink = inkFor(spec);
  const R = s * 0.46;
  const arcId = spec.uid("arc");
  // bottom arc for the curved name (left → right along the lower ring)
  const ar = s * 0.34;
  const arcPath = `M ${nn(c - ar)} ${nn(c + ar * 0.35)} A ${nn(ar)} ${nn(ar)} 0 0 0 ${nn(c + ar)} ${nn(c + ar * 0.35)}`;
  const defs = defs0 + `<path id="${arcId}" d="${arcPath}" fill="none"/>`;

  let body = "";
  body += `<circle cx="${nn(c)}" cy="${nn(c)}" r="${nn(R)}" fill="none" stroke="${g}" stroke-width="${nn(s * 0.03)}"/>`;
  body += `<circle cx="${nn(c)}" cy="${nn(c)}" r="${nn(R - s * 0.05)}" fill="none" stroke="${ink}" stroke-width="${nn(s * 0.006)}" opacity="0.6"/>`;
  if (spec.icon) body += iconEl(spec.icon, s * 0.34, c, c - s * 0.09, g, 2);
  else
    body += `<text x="${nn(c)}" y="${nn(c - s * 0.05)}" font-family="${spec.font.stack}" font-weight="${spec.font.weight}" font-size="${nn(s * 0.32)}" fill="${g}" text-anchor="middle" dominant-baseline="central">${esc(spec.initials)}</text>`;
  // side dot dividers
  body += `<circle cx="${nn(c - s * 0.3)}" cy="${nn(c + s * 0.1)}" r="${nn(s * 0.014)}" fill="${ink}"/>`;
  body += `<circle cx="${nn(c + s * 0.3)}" cy="${nn(c + s * 0.1)}" r="${nn(s * 0.014)}" fill="${ink}"/>`;
  // curved name
  const fs = s * 0.088;
  body += `<text font-family="${spec.font.stack}" font-weight="${spec.font.weight}" font-size="${nn(fs)}" fill="${ink}" letter-spacing="${nn(fs * 0.14)}"><textPath href="#${arcId}" startOffset="50%" text-anchor="middle">${esc(spec.name.toUpperCase())}</textPath></text>`;
  return { svg: body, size: s, defs };
}
