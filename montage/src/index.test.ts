import { describe, expect, it } from "vitest";
import { buildMontage, PRESETS, resolvePreset } from "./index.js";
import type { TimelineSpec } from "./index.js";

const FONT = "/fonts/Mukta-Bold.ttf";
const base = (over: Partial<TimelineSpec> = {}): TimelineSpec => ({
  preset: "reels",
  fontFile: FONT,
  output: "out.mp4",
  segments: [{ kind: "clip", src: "a.mp4", duration: 4 }],
  ...over,
});

describe("presets", () => {
  it("reels is 1080×1920 with a safe area", () => {
    const p = resolvePreset("reels");
    expect([p.width, p.height]).toEqual([1080, 1920]);
    expect(p.safe.bottom).toBeGreaterThan(0);
    expect(PRESETS.youtube.width).toBe(1920);
  });
});

describe("buildMontage — inputs & encode", () => {
  it("emits a clip input and a safe default encode", () => {
    const r = buildMontage(base());
    expect(r.args.slice(0, 1)).toEqual(["-y"]);
    expect(r.args.join(" ")).toContain("-t 4 -i a.mp4");
    expect(r.args).toContain("-an"); // no audio → silent
    expect(r.args).toContain("-threads");
    expect(r.args[r.args.indexOf("-threads") + 1]).toBe("2");
    expect(r.args).toContain("libx264");
    expect(r.args[r.args.length - 1]).toBe("out.mp4");
    expect([r.width, r.height]).toEqual([1080, 1920]);
  });

  it("loops a still and applies Ken Burns zoompan", () => {
    const r = buildMontage(base({ segments: [{ kind: "still", src: "img.jpg", duration: 5, kenBurns: "in" }] }));
    expect(r.args.join(" ")).toContain("-loop 1 -t 5 -i img.jpg");
    expect(r.filter).toContain("zoompan=");
    expect(r.filter).toContain("1080x1920");
    expect(r.duration).toBe(5);
  });
});

describe("buildMontage — transitions", () => {
  it("builds an xfade with the right offset and shortened duration", () => {
    const r = buildMontage(base({
      segments: [
        { kind: "clip", src: "a.mp4", duration: 4 },
        { kind: "clip", src: "b.mp4", duration: 4 },
      ],
      transitions: { type: "crossfade", duration: 0.5 },
    }));
    expect(r.filter).toContain("xfade=transition=fade:duration=0.5:offset=3.5");
    expect(r.duration).toBe(7.5); // 4 + 4 - 0.5
  });

  it("maps each transition type to an xfade name", () => {
    const r = buildMontage(base({
      segments: [
        { kind: "clip", src: "a.mp4", duration: 3 },
        { kind: "clip", src: "b.mp4", duration: 3 },
        { kind: "clip", src: "c.mp4", duration: 3 },
      ],
      transitions: [{ type: "zoom-punch" }, { type: "whip" }],
    }));
    expect(r.filter).toContain("transition=zoomin");
    expect(r.filter).toContain("transition=smoothleft");
  });
});

describe("buildMontage — captions, lower-thirds, logo, audio", () => {
  it("renders a Devanagari caption via drawtext with the font, escaping colons", () => {
    const r = buildMontage(base({
      captions: [{ text: "समाचार: आज", start: 0, end: 3, position: "bottom" }],
    }));
    expect(r.filter).toContain("drawtext=");
    expect(r.filter).toContain("fontfile='/fonts/Mukta-Bold.ttf'");
    expect(r.filter).toContain("समाचार"); // Devanagari text present
    expect(r.filter).toContain("\\:"); // the ':' in the caption is escaped
    expect(r.filter).toContain("enable='between(t,0,3)'");
    expect(r.filter).toContain("[vout]");
  });

  it("adds a logo input and overlay pinned to the safe area", () => {
    const r = buildMontage(base({ logo: { src: "logo.png", corner: "top-right", width: 120 } }));
    expect(r.args.join(" ")).toContain("-i logo.png");
    expect(r.filter).toContain("scale=120:-1[logo]");
    expect(r.filter).toContain("overlay=");
  });

  it("maps a provided audio track with aac, capped by -t at the timeline length, never -shortest (1.1.2)", () => {
    const r = buildMontage(base({ audio: "mix.m4a" }));
    expect(r.args.join(" ")).toContain("-i mix.m4a");
    const ai = r.args.indexOf("-map");
    expect(r.args.join(" ")).toContain(":a");
    expect(r.args).toContain("aac");
    expect(r.args).not.toContain("-shortest");
    const t = r.args.lastIndexOf("-t");
    expect(Number(r.args[t + 1])).toBe(r.duration);
    expect(ai).toBeGreaterThan(0);
  });

  it("draws a lower-third band with title + subtitle", () => {
    const r = buildMontage(base({ lowerThirds: [{ title: "काठमाडौं", subtitle: "संवाददाता", start: 1, end: 4 }] }));
    expect(r.filter).toContain("drawbox=");
    expect(r.filter).toContain("काठमाडौं");
    expect(r.filter).toContain("संवाददाता");
  });

  it("draws an animated progress bar", () => {
    const r = buildMontage(base({ progressBar: true, segments: [{ kind: "clip", src: "a.mp4", duration: 6 }] }));
    expect(r.filter).toContain("drawbox=x=0:y=");
    expect(r.filter).toContain("iw*t/6");
  });
});

describe("buildMontage — guards", () => {
  it("throws with no segments", () => {
    expect(() => buildMontage(base({ segments: [] }))).toThrow();
  });
});

describe("1.1: fast quality, ASS, renditions", () => {
  it("fast quality switches to ultrafast/crf 23/24 fps and 1.5× Ken Burns", () => {
    const r = buildMontage(base({ segments: [{ kind: "still", src: "img.jpg", duration: 4 }] }), { quality: "fast" });
    expect(r.args).toContain("ultrafast");
    expect(r.args[r.args.indexOf("-crf") + 1]).toBe("23");
    expect(r.fps).toBe(24);
    expect(r.filter).toContain("scale=1620:2880"); // 1.5× of 1080×1920
    const std = buildMontage(base({ segments: [{ kind: "still", src: "img.jpg", duration: 4 }] }));
    expect(std.filter).toContain("scale=2160:3840");
  });
  it("burns an ASS file with libass and swaps renditions", () => {
    const r = buildMontage(base({ ass: { file: "/tmp/c.ass", fontsDir: "/fonts" } }), { renditions: { "a.mp4": "/mez/a.720p.mp4" } });
    expect(r.filter).toContain("subtitles='/tmp/c.ass':fontsdir='/fonts'");
    expect(r.args.join(" ")).toContain("-i /mez/a.720p.mp4");
    expect(r.args.join(" ")).not.toContain("-i a.mp4");
  });
  it("prepareRenditions emits one job per distinct clip", async () => {
    const { prepareRenditions } = await import("./index.js");
    const spec = base({ segments: [{ kind: "clip", src: "/stock/a.mp4", duration: 3 }, { kind: "clip", src: "/stock/a.mp4", duration: 2, start: 5 }, { kind: "still", src: "x.jpg", duration: 2 }, { kind: "clip", src: "/stock/b.mov", duration: 3 }] });
    const r = prepareRenditions(spec, { outDir: "/mez/" });
    expect(r.jobs.map((j) => j.out)).toEqual(["/mez/a.720p.mp4", "/mez/b.720p.mp4"]);
    expect(r.jobs[0]!.args).toContain("scale=-2:720");
    expect(r.renditions["/stock/b.mov"]).toBe("/mez/b.720p.mp4");
  });
});

describe("1.1: multi-cut + plan", () => {
  const spec = base({
    preset: "landscape",
    segments: [{ kind: "clip", src: "a.mp4", duration: 5 }, { kind: "still", src: "b.jpg", duration: 4 }],
    transitions: { type: "crossfade", duration: 0.5 },
    audio: "en.m4a",
    logo: { src: "logo.png" },
  });
  it("renders en/ne/square cuts from one decode with split, per-cut captions, audio and canvas", async () => {
    const { buildMultiCut } = await import("./index.js");
    const r = buildMultiCut(spec, [
      { preset: "landscape", output: "en.mp4", captions: [{ text: "Hello", start: 0, end: 2 }] },
      { preset: "landscape", output: "ne.mp4", captions: [{ text: "नमस्ते", start: 0, end: 2 }], audio: "ne.m4a" },
      { preset: "square", output: "sq.mp4", ass: { file: "sq.ass" } },
    ]);
    expect(r.filter).toContain("split=3[b0][b1][b2]");
    expect(r.filter).toContain("[b2]scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080");
    expect(r.filter).toContain("text='नमस्ते'");
    expect(r.filter).toContain("subtitles='sq.ass'");
    expect(r.filter.match(/zoompan=/g)!.length).toBe(1); // Ken Burns computed once
    expect(r.filter.match(/xfade=/g)!.length).toBe(1);
    const a = r.args.join(" ");
    expect(a).toContain("-map [out0] -map 2:a"); // en.m4a is input 2
    expect(a).toContain("-map [out1] -map 4:a"); // ne.m4a added after logo (3)
    expect(a).toContain("-map [out2] -map 2:a");
    expect(r.outputs.map((o: { output: string }) => o.output)).toEqual(["en.mp4", "ne.mp4", "sq.mp4"]);
    expect(r.duration).toBe(8.5);
    expect((a.match(/libx264/g) ?? []).length).toBe(3);
  });
  it("plan() estimates seconds, breaks it down and suggests cheaper options", async () => {
    const { plan, calibrate } = await import("./index.js");
    const p = plan(spec, { cuts: [{ preset: "square", output: "sq.mp4" }] });
    expect(p.frames).toBe(255);
    expect(p.estimatedSeconds).toBeGreaterThan(0);
    expect(p.breakdown.encode).toBeGreaterThan(0);
    expect(p.suggestions.length).toBeGreaterThan(0);
    const fast = plan(spec, { quality: "fast", cuts: [{ preset: "square", output: "sq.mp4" }] });
    expect(fast.estimatedSeconds).toBeLessThan(p.estimatedSeconds);
    expect(p.suggestions.find((s) => s.change.startsWith("quality"))!.estimatedSeconds).toBe(fast.estimatedSeconds);
    expect(calibrate(p, p.estimatedSeconds * 2)).toBe(0.5); // box is half as fast as baseline
    expect(plan(spec, { machineFactor: 2 }).estimatedSeconds).toBeLessThan(plan(spec).estimatedSeconds);
  });
});
