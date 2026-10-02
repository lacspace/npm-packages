export interface SparkOptions {
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  /** Mark the last point. Default true. */
  endDot?: boolean;
  /** Draw a baseline at this value (e.g. yesterday's close). */
  baseline?: number;
  /** "line" (default) or "bars". */
  type?: "line" | "bars";
}

/** Dependency-free sparkline / mini-bar SVG, returned as a data URI that sharp rasterises. */
export function sparklineSvg(values: number[], options: SparkOptions = {}): string {
  const w = options.width ?? 900, h = options.height ?? 200, color = options.color ?? "#c8102e";
  const pts = values.filter((v) => Number.isFinite(v));
  if (pts.length < 2) return svgToDataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"></svg>`);
  const lo = Math.min(...pts, options.baseline ?? Infinity), hi = Math.max(...pts, options.baseline ?? -Infinity);
  const range = hi - lo || 1;
  const padY = 10;
  const sx = (i: number) => (i / (pts.length - 1)) * (w - 8) + 4;
  const sy = (v: number) => h - padY - ((v - lo) / range) * (h - padY * 2);
  let body = "";
  if (options.type === "bars") {
    const bw = Math.max(2, (w - 8) / pts.length - 3);
    body = pts.map((v, i) => `<rect x="${(4 + (i * (w - 8)) / pts.length).toFixed(1)}" y="${sy(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(h - padY - sy(v)).toFixed(1)}" rx="2" fill="${color}"/>`).join("");
  } else {
    const d = pts.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(" ");
    if (options.fill !== false) body += `<path d="${d} L${sx(pts.length - 1).toFixed(1)},${h} L${sx(0).toFixed(1)},${h} Z" fill="${color}" fill-opacity="0.15"/>`;
    body += `<path d="${d}" fill="none" stroke="${color}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (options.endDot !== false) body += `<circle cx="${sx(pts.length - 1).toFixed(1)}" cy="${sy(pts[pts.length - 1]!).toFixed(1)}" r="9" fill="${color}"/>`;
  }
  if (options.baseline !== undefined) body += `<line x1="0" x2="${w}" y1="${sy(options.baseline).toFixed(1)}" y2="${sy(options.baseline).toFixed(1)}" stroke="${color}" stroke-opacity="0.5" stroke-width="2" stroke-dasharray="8 8"/>`;
  return svgToDataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`);
}

/** Simple weather glyphs (sun / cloud / rain / storm / snow / fog) as SVG data URIs, tinted. */
export function weatherIcon(kind: "sun" | "partly" | "cloud" | "rain" | "storm" | "snow" | "fog", color = "#ffffff"): string {
  const sun = `<circle cx="32" cy="32" r="12" fill="${color}"/>` + [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<line x1="32" y1="8" x2="32" y2="14" stroke="${color}" stroke-width="4" stroke-linecap="round" transform="rotate(${a} 32 32)"/>`).join("");
  const cloud = (x = 0, y = 0, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M20 44a10 10 0 0 1 2-19.8A14 14 0 0 1 48 26a9 9 0 0 1 2 18z" fill="${color}"/></g>`;
  const drops = (n: number) => Array.from({ length: n }, (_, i) => `<line x1="${22 + i * 10}" y1="48" x2="${18 + i * 10}" y2="58" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`).join("");
  const body: Record<string, string> = {
    sun,
    partly: `<g transform="translate(-6 -6) scale(0.7)">${sun}</g>${cloud(4, 6, 0.95)}`,
    cloud: cloud(),
    rain: cloud(0, -6) + drops(3),
    storm: cloud(0, -8) + `<path d="M34 40l-8 12h8l-4 10 12-14h-8l4-8z" fill="${color}"/>`,
    snow: cloud(0, -6) + [0, 1, 2].map((i) => `<circle cx="${24 + i * 10}" cy="54" r="3" fill="${color}"/>`).join(""),
    fog: [0, 1, 2].map((i) => `<line x1="12" x2="52" y1="${26 + i * 9}" y2="${26 + i * 9}" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`).join(""),
  };
  return svgToDataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${body[kind] ?? cloud()}</svg>`);
}

/** Map a DHM condition name (en or ne) to a glyph. */
export function iconFor(condition: string | undefined): Parameters<typeof weatherIcon>[0] {
  const c = (condition ?? "").toLowerCase();
  if (/thunder|storm|मेघगर्जन|चट्याङ/.test(c)) return "storm";
  if (/snow|हिम|हिउँ/.test(c)) return "snow";
  if (/rain|shower|drizzle|वर्षा|पानी/.test(c)) return "rain";
  if (/fog|mist|haze|कुहिरो|तुवाँलो/.test(c)) return "fog";
  if (/partly|आंशिक/.test(c)) return "partly";
  if (/cloud|overcast|बादल/.test(c)) return "cloud";
  return "sun";
}

export function svgToDataUri(svg: string): string {
  const b64 = typeof Buffer !== "undefined" ? Buffer.from(svg, "utf8").toString("base64") : btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${b64}`;
}
