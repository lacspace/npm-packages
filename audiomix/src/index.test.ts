import { describe, expect, it, vi } from "vitest";
import {
  buildAttribution, buildMix, detectTempo, parseLicence, pickTrack, searchFreeMusic,
  snapToBeats, trendingFreeMusic, Track,
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

describe("searchFreeMusic — Jamendo (CC music)", () => {
  const JAMENDO = {
    results: [
      {
        id: "1", name: "Sunrise Drive", artist_name: "Artist A", duration: "180",
        audio: "https://j/stream/1.mp3", audiodownload: "https://j/dl/1.mp3",
        shareurl: "https://jamendo.com/track/1", license_ccurl: "http://creativecommons.org/licenses/by/3.0/",
        musicinfo: { speed: "high", tags: { genres: ["electronic"], vartags: ["energetic", "happy"] } },
      },
      {
        id: "2", name: "Quiet Room", artist_name: "Artist B", duration: "95",
        audio: "https://j/stream/2.mp3", audiodownload: "https://j/dl/2.mp3",
        shareurl: "https://jamendo.com/track/2", license_ccurl: "http://creativecommons.org/licenses/by-sa/4.0/",
        musicinfo: { speed: "low", tags: { genres: ["ambient"], vartags: ["calm", "relax"] } },
      },
    ],
  };
  const fetchImpl = () => vi.fn(async () => ({ ok: true, status: 200, json: async () => JAMENDO })) as any;

  it("normalizes tracks with CC licence + attribution and maps mood", async () => {
    const f = fetchImpl();
    const r = await searchFreeMusic("cid", { query: "drive", fetch: f });
    expect(r.tracks).toHaveLength(2);
    const t0 = r.tracks[0]!;
    expect(t0.path).toBe("https://j/dl/1.mp3"); // ffmpeg can read the URL directly
    expect(t0.licence.licence).toBe("CC BY 3.0");
    expect(t0.licence.attribution).toContain("Sunrise Drive");
    expect(t0.licence.attribution).toContain("Jamendo");
    expect(t0.mood).toBe("energetic");
    expect(r.tracks[1]!.mood).toBe("calm");
    // requested client_id + search + trending order
    const url = f.mock.calls[0][0] as string;
    expect(url).toContain("client_id=cid");
    expect(url).toContain("order=popularity_total");
    expect(url).toContain("search=drive");
  });

  it("trendingFreeMusic orders by overall popularity", async () => {
    const f = fetchImpl();
    await trendingFreeMusic("cid", { fetch: f });
    expect((f.mock.calls[0][0] as string)).toContain("order=popularity_total");
  });

  it("filters by mood and warns without a client_id", async () => {
    const calm = await searchFreeMusic("cid", { mood: "calm", fetch: fetchImpl() });
    expect(calm.tracks.every((t) => t.mood === "calm")).toBe(true);
    const none = await searchFreeMusic("", { fetch: fetchImpl() });
    expect(none.tracks).toEqual([]);
    expect(none.warnings[0]).toContain("client_id");
  });
});
