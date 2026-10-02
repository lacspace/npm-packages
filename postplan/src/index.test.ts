import { describe, expect, it, vi } from "vitest";
import { planPosts, tieBreakPrompt } from "./index.js";

describe("planPosts — platform fit & capability", () => {
  it("gives TikTok/YouTube video when a video exists, text when it doesn't", async () => {
    const withVid = await planPosts({ hasVideo: true }, { platforms: ["tiktok", "youtube"] });
    expect(withVid.map((p) => p.format)).toEqual(["video", "video"]);
    const noVid = await planPosts({ hasVideo: false, textLength: 200 }, { platforms: ["tiktok"] });
    expect(noVid[0]!.format).not.toBe("video"); // can't do video without an asset
  });

  it("never chooses an impossible format", async () => {
    const r = await planPosts({ hasVideo: false, imageCount: 0 }, { platforms: ["facebook"] });
    expect(["image", "text"]).toContain(r[0]!.format); // no video, no carousel possible
  });

  it("picks a carousel when there are multiple images (Instagram)", async () => {
    const r = await planPosts({ imageCount: 5 }, { platforms: ["instagram"] });
    expect(r[0]!.format).toBe("carousel");
  });
});

describe("planPosts — natural mix", () => {
  it("avoids repeating Facebook's recent format (not all videos)", async () => {
    const r = await planPosts(
      { hasVideo: true, imageCount: 3 },
      { platforms: ["facebook"], recent: { facebook: ["video", "video", "video"] } },
    );
    expect(r[0]!.format).not.toBe("video"); // the mix penalty pushes it off video
  });

  it("breaking news prefers a fast format over a carousel", async () => {
    const r = await planPosts({ isBreaking: true, imageCount: 4 }, { platforms: ["facebook"] });
    expect(r[0]!.format).not.toBe("carousel");
  });
});

describe("planPosts — AI tie-break", () => {
  it("consults the llm only on a close call and can flip the choice", async () => {
    const llm = vi.fn(async () => "image");
    // facebook image(0.7) vs carousel(0.62) → gap 0.08 < 0.1 → tie-break fires.
    const r = await planPosts({ imageCount: 3 }, { platforms: ["facebook"] }, { llm, tieThreshold: 0.1 });
    expect(llm).toHaveBeenCalledTimes(1);
    expect(r[0]!.format).toBe("image");
  });

  it("does NOT call the llm when there is a clear winner", async () => {
    const llm = vi.fn(async () => "text");
    await planPosts({ hasVideo: true }, { platforms: ["youtube"] }, { llm });
    expect(llm).not.toHaveBeenCalled(); // youtube video dominates
  });

  it("falls back to the deterministic pick if the llm throws", async () => {
    const llm = vi.fn(async () => {
      throw new Error("budget");
    });
    const r = await planPosts({ imageCount: 3 }, { platforms: ["facebook"] }, { llm });
    expect(r[0]!.format).toBeDefined();
    expect(r[0]!.aiTieBreak).toBeUndefined();
  });

  it("builds a compact tie-break prompt", () => {
    const p = tieBreakPrompt("facebook", { isBreaking: true, hasVideo: true }, ["video", "image"]);
    expect(p).toContain("facebook");
    expect(p).toContain("video or image");
    expect(p.length).toBeLessThan(200);
  });
});

describe("planPosts — output shape", () => {
  it("returns alternatives and reasons per platform", async () => {
    const r = await planPosts({ hasVideo: true, imageCount: 3 }, { platforms: ["instagram", "x"] });
    expect(r).toHaveLength(2);
    expect(r[0]!.alternatives.length).toBeGreaterThan(0);
    expect(r[0]!.reasons.length).toBeGreaterThan(0);
    expect(r[0]!.score).toBeGreaterThan(0);
  });
});
