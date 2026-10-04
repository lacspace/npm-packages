import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { escapeDrawtext, escapePath } from "./escape.js";

/** ffmpeg's av_get_token(): quotes, backslash escapes, edge-whitespace trimming. */
function getToken(buf: string, term: string): [string, string] {
  let i = 0, out = "", end = 0;
  while (i < buf.length && /\s/.test(buf[i]!)) i++;
  while (i < buf.length && !term.includes(buf[i]!)) {
    const c = buf[i++]!;
    if (c === "\\" && i < buf.length) { out += buf[i++]; end = out.length; }
    else if (c === "'") { while (i < buf.length && buf[i] !== "'") out += buf[i++]; i++; end = out.length; }
    else { out += c; if (!/\s/.test(c)) end = out.length; }
  }
  return [out.slice(0, end), buf.slice(i)];
}
/** drawtext text expansion for strings without %{…}: "\x" → "x". */
const expand = (s: string) => s.replace(/\\(.)/gsu, "$1");

/** Parse `drawtext=fontfile='…':text='…':…` the way ffmpeg does and return the option values. */
function parse(graph: string): Record<string, string> {
  const [, rest] = getToken(graph, "=");
  let [args] = getToken(rest.slice(1), "[],;"); // level 1: filtergraph
  const opts: Record<string, string> = {};
  while (args.length) { // level 2: key=value:key=value
    const [k, r1] = getToken(args, "=:");
    const [v, r2] = getToken(r1.slice(1), ":");
    opts[k] = v;
    args = r2.slice(1);
  }
  return opts;
}

const NASTY = ["Nepal's budget", 'He said "yes"', "Time: 10:30", "Up 5% today", "back\\slash", "one, two", "a;b", "[tag] x",
  "PM's 100% \"deal\": a,b;[c]\\d", "प्रधानमन्त्रीले भने। ठीक छ", "  padded  ", "it''s", "'", "\\'", "=x="];

describe("escapeDrawtext / escapePath (1.1.1)", () => {
  it("round-trips every special character through all three ffmpeg parsing levels", () => {
    for (const t of NASTY) {
      const g = `drawtext=fontfile='${escapePath("/fonts/Font's: [dir], x/Mukta.ttf")}':text='${escapeDrawtext(t)}':fontsize=20:y='(h-28)/2+36*(1-min(1,(t-0.2)/0.3))':enable='between(t,0,1)'`;
      const o = parse(g);
      expect(expand(o.text!)).toBe(t);
      expect(o.fontfile).toBe("/fonts/Font's: [dir], x/Mukta.ttf");
      expect(o.y).toBe("(h-28)/2+36*(1-min(1,(t-0.2)/0.3))");
      expect(o.enable).toBe("between(t,0,1)");
    }
  });

  // Real render check. Set FFMPEG_DRAWTEXT to an ffmpeg built with drawtext (libfreetype + libharfbuzz)
  // and FONT_FILE to a TTF; the rendered frame must equal the same text drawn from a textfile.
  const ff = process.env.FFMPEG_DRAWTEXT, font = process.env.FONT_FILE;
  it.skipIf(!ff || !font)("renders pixel-identical to textfile= on a real ffmpeg", () => {
    const dir = mkdtempSync(join(tmpdir(), "montage-esc-"));
    const frame = (vf: string) => execFileSync(ff!, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=640x200:d=0.2",
      "-filter_complex", vf, "-map", "[v]", "-frames:v", "1", "-f", "md5", "-"], { encoding: "utf8" });
    for (const t of NASTY.filter((s) => !/[ऀ-ॿ]/.test(s))) {
      writeFileSync(join(dir, "raw.txt"), t);
      const tail = `fontsize=28:fontcolor=white:x=10:y='(h-28)/2+36*(1-min(1,(t-0)/0.3))':enable='between(t,0,1)'[v]`;
      const a = frame(`[0:v]drawtext=fontfile='${escapePath(font!)}':text='${escapeDrawtext(t)}':${tail}`);
      const b = frame(`[0:v]drawtext=fontfile='${escapePath(font!)}':textfile='${escapePath(join(dir, "raw.txt"))}':expansion=none:${tail}`);
      expect(a).toBe(b);
    }
  });
});
