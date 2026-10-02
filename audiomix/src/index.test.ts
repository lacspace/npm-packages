import { describe, expect, it } from "vitest";
import {
  buildAttribution, buildMix, detectTempo, parseLicence, pickTrack, snapToBeats, Track,
} from "./index.js";

describe("library — licence parsing & attribution", () => {
  it("parses JSON licence sidecars", () => {
    const r = parseLicence(JSON.stringify({ title: "Sunrise", author: "Kevin MacLeod", licence: "CC BY 4.0", mood: "calm", bpm: 92, duration: 120 }));
    expect(r.licence.title).toBe("Sunrise");
    expect(r.mood).toBe("calm");
    expect(r.bpm).toBe(92);
    expect(r.licence.attribution).toContain("Kevin MacLeod");
    expect(r.licence.attribution).toContain("CC BY 4.0");
  });
  it("parses Key: value text licences and infers mood", () => {
    const r = parseLicence("Title: Tense Pulse\nAuthor: Jane\nLicence: CC0\nMood: urgent");
    expect(r.licence.author).toBe("Jane");
    expect(r.mood).toBe("breaking"); // "urgent" → breaking
  });
  it("buildAttribution special-cases Kevin MacLeod / incompetech", () => {
    expect(buildAttribution({ title: "X", author: "Kevin MacLeod", licence: "CC BY 4.0" })).toContain("incompetech.com");
    expect(buildAttribution({ title: "Y", author: "Someone", licence: "CC0", url: "u" })).toBe('"Y" by Someone (u) — CC0');
  });
});

describe("pickTrack — deterministic selection", () => {
  const mk = (path: string, mood: Track["mood"], duration?: number): Track => ({
    path, mood, duration, tags: [], licence: { title: path, author: "a", licence: "CC0", attribution: path },
  });
  const tracks = [mk("a.mp3", "calm", 60), mk("b.mp3", "energetic", 120), mk("c.mp3", "calm", 200)];
  it("filters by mood and min duration", () => {
    expect(pickTrack(tracks, { mood: "calm", minDuration: 100 })!.path).toBe("c.mp3");
  });
  it("rotates deterministically", () => {
    expect(pickTrack(tracks, { mood: "calm", rotate: 0 })!.path).toBe("a.mp3");
    expect(pickTrack(tracks, { mood: "calm", rotate: 1 })!.path).toBe("c.mp3");
  });
});

describe("detectTempo — energy onset + autocorrelation", () => {
  it("recovers a known click tempo", () => {
    const sr = 22050;
    const bpm = 120;
    const period = Math.round((60 / bpm) * sr); // samples between clicks
    const samples = new Float32Array(sr * 4);
    for (let i = 0; i < samples.length; i += period) {
      for (let k = 0; k < 200 && i + k < samples.length; k++) samples[i + k] = 1 - k / 200; // short decaying click
    }
    const r = detectTempo(samples, sr);
    expect(Math.abs(r.bpm - 120)).toBeLessThanOrEqual(6); // 120 ± a hair (or a harmonic handled by range)
    expect(r.beats.length).toBeGreaterThan(5);
  });
  it("returns empty for too-short input", () => {
    expect(detectTempo(new Float32Array(100), 22050).bpm).toBe(0);
  });
  it("snaps cut times to the nearest beat", () => {
    expect(snapToBeats([0.4, 1.1], [0, 0.5, 1, 1.5])).toEqual([0.5, 1]);
  });
});

describe("buildMix — ffmpeg command", () => {
  const music: Track = {
    path: "bed.mp3", mood: "calm", duration: 180, tags: [],
    licence: { title: "Sunrise", author: "Kevin MacLeod", licence: "CC BY 4.0", attribution: "Music: Sunrise by Kevin MacLeod (incompetech.com) — Licensed under CC BY 4.0" },
  };

  it("ducks music under the voice and normalizes to -14 LUFS", () => {
    const r = buildMix({ voice: "vo.wav", music, output: "mix.m4a" });
    expect(r.args.slice(0, 3)).toEqual(["-y", "-i", "vo.wav"]);
    expect(r.args.join(" ")).toContain("-i bed.mp3");
    expect(r.filter).toContain("sidechaincompress");
    expect(r.filter).toContain("loudnorm=I=-14");
    expect(r.filter).toContain("amix=inputs=2");
    expect(r.args).toContain("[out]");
    expect(r.attribution).toEqual(["Music: Sunrise by Kevin MacLeod (incompetech.com) — Licensed under CC BY 4.0"]);
  });

  it("places stings with adelay and carries their attribution", () => {
    const r = buildMix({
      voice: "vo.wav",
      music,
      stings: [{ src: "whoosh.wav", at: 2.5, attribution: "SFX: whoosh (CC0)" }],
      output: "mix.m4a",
    });
    expect(r.filter).toContain("adelay=2500|2500");
    expect(r.filter).toContain("amix=inputs=3"); // voice + music + 1 sting
    expect(r.attribution).toContain("SFX: whoosh (CC0)");
  });

  it("works voice-only (no music)", () => {
    const r = buildMix({ voice: "vo.wav", output: "mix.m4a" });
    expect(r.filter).toContain("amix=inputs=1");
    expect(r.filter).not.toContain("sidechaincompress");
    expect(r.attribution).toEqual([]);
  });
});
