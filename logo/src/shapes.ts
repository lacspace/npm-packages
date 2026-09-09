/** SVG builders: enclosure shapes, gradient defs and icon rendering. */
import type { IconDef, ShapeKind } from "./types.js";

let gid = 0;
export function gradientId(prefix = "g"): string {
  return `${prefix}${(gid = (gid + 1) % 1e6)}`;
}

export function linearGradient(id: string, from: string, to: string, angle = 60): string {
  const a = (angle * Math.PI) / 180;
  const x2 = (0.5 + Math.cos(a) / 2).toFixed(3);
  const y2 = (0.5 + Math.sin(a) / 2).toFixed(3);
  const x1 = (0.5 - Math.cos(a) / 2).toFixed(3);
  const y1 = (0.5 - Math.sin(a) / 2).toFixed(3);
  return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>`;
}

const n = (v: number) => Math.round(v * 100) / 100;

/** An enclosure shape element centred in a `size`×`size` box, filled with `fill`. */
export function shapeEl(kind: ShapeKind, size: number, fill: string, stroke?: string, strokeW = 0): string {
  const c = size / 2;
  const pad = size * 0.06;
  const r = c - pad;
  const attrs = `fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${strokeW}"` : ""}`;

  switch (kind) {
    case "none":
      return "";
    case "circle":
      return `<circle cx="${n(c)}" cy="${n(c)}" r="${n(r)}" ${attrs}/>`;
    case "rounded":
      return `<rect x="${n(pad)}" y="${n(pad)}" width="${n(size - pad * 2)}" height="${n(size - pad * 2)}" rx="${n(size * 0.16)}" ${attrs}/>`;
    case "squircle":
      return `<rect x="${n(pad)}" y="${n(pad)}" width="${n(size - pad * 2)}" height="${n(size - pad * 2)}" rx="${n(size * 0.3)}" ${attrs}/>`;
    case "diamond": {
      const pts = [
        [c, c - r],
        [c + r, c],
        [c, c + r],
        [c - r, c],
      ]
        .map((p) => `${n(p[0]!)},${n(p[1]!)}`)
        .join(" ");
      return `<polygon points="${pts}" rx="8" ${attrs}/>`;
    }
    case "hexagon": {
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 180) * (60 * i - 90);
        pts.push(`${n(c + r * Math.cos(a))},${n(c + r * Math.sin(a))}`);
      }
      return `<polygon points="${pts.join(" ")}" ${attrs}/>`;
    }
    case "shield": {
      const d = `M ${n(c)} ${n(c - r)} L ${n(c + r * 0.82)} ${n(c - r * 0.55)} L ${n(c + r * 0.82)} ${n(c + r * 0.1)} C ${n(c + r * 0.82)} ${n(c + r * 0.6)} ${n(c + r * 0.45)} ${n(c + r * 0.9)} ${n(c)} ${n(c + r)} C ${n(c - r * 0.45)} ${n(c + r * 0.9)} ${n(c - r * 0.82)} ${n(c + r * 0.6)} ${n(c - r * 0.82)} ${n(c + r * 0.1)} L ${n(c - r * 0.82)} ${n(c - r * 0.55)} Z`;
      return `<path d="${d}" ${attrs}/>`;
    }
    case "seal": {
      const teeth = 24;
      const inner = r * 0.9;
      let d = "";
      const steps = teeth * 6;
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        const rad = inner + (r - inner) * (0.5 + 0.5 * Math.cos(teeth * t));
        const x = c + rad * Math.cos(t - Math.PI / 2);
        const y = c + rad * Math.sin(t - Math.PI / 2);
        d += `${i === 0 ? "M" : "L"} ${n(x)} ${n(y)} `;
      }
      return `<path d="${d}Z" ${attrs}/>`;
    }
    case "blob": {
      // A fixed smooth organic blob authored in a 100-box, scaled to size.
      const k = size / 100;
      const p = (x: number, y: number) => `${n(x * k)} ${n(y * k)}`;
      const d = `M ${p(50, 8)} C ${p(74, 8)} ${p(92, 24)} ${p(92, 48)} C ${p(92, 72)} ${p(78, 92)} ${p(52, 92)} C ${p(28, 92)} ${p(8, 78)} ${p(8, 52)} C ${p(8, 28)} ${p(26, 8)} ${p(50, 8)} Z`;
      return `<path d="${d}" ${attrs}/>`;
    }
    default:
      return `<circle cx="${n(c)}" cy="${n(c)}" r="${n(r)}" ${attrs}/>`;
  }
}

/** Render a line-icon (24-grid) centred at (cx,cy) at box size `box`. */
export function iconEl(icon: IconDef, box: number, cx: number, cy: number, color: string, strokeW = 2): string {
  const sc = box / 24;
  const tx = cx - box / 2;
  const ty = cy - box / 2;
  return `<g transform="translate(${n(tx)} ${n(ty)}) scale(${n(sc)})" fill="none" stroke="${color}" stroke-width="${strokeW}" stroke-linecap="round" stroke-linejoin="round">${icon.svg}</g>`;
}
