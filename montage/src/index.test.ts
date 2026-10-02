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

  it("maps a provided audio track with aac + shortest", () => {
    const r = buildMontage(base({ audio: "mix.m4a" }));
    expect(r.args.join(" ")).toContain("-i mix.m4a");
    const ai = r.args.indexOf("-map");
    expect(r.args.join(" ")).toContain(":a");
    expect(r.args).toContain("aac");
    expect(r.args).toContain("-shortest");
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
