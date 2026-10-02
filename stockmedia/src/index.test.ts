import { describe, expect, it, vi } from "vitest";
import { createStockMedia, FetchLike, isNewsSafe, orientationOf } from "./index.js";

// --- canned provider responses -----------------------------------------------------
const PEXELS_PHOTOS = {
  photos: [
    {
      id: 101, width: 4000, height: 3000, url: "https://pexels.com/photo/101", alt: "mountain landscape sunrise",
      photographer: "Jane Doe", photographer_url: "https://pexels.com/@jane",
      src: { original: "https://img/orig.jpg", large2x: "https://img/2x.jpg", large: "https://img/l.jpg", medium: "https://img/m.jpg" },
    },
    {
      id: 102, width: 3000, height: 4000, url: "https://pexels.com/photo/102", alt: "portrait of a woman",
      photographer: "Sam Lee", photographer_url: "https://pexels.com/@sam",
      src: { original: "https://img/o2.jpg", medium: "https://img/m2.jpg" },
    },
  ],
};
const PEXELS_VIDEOS = {
  videos: [
    {
      id: 201, width: 1920, height: 1080, duration: 12, url: "https://pexels.com/video/201", image: "https://img/thumb.jpg",
      user: { name: "Reel Co", url: "https://pexels.com/@reel" },
      video_files: [
        { link: "https://v/hd.mp4", width: 1920, height: 1080, quality: "hd", file_type: "video/mp4" },
        { link: "https://v/sd.mp4", width: 960, height: 540, quality: "sd", file_type: "video/mp4" },
      ],
    },
  ],
};
const PIXABAY_PHOTOS = {
  hits: [
    {
      id: 301, imageWidth: 5000, imageHeight: 3333, pageURL: "https://pixabay.com/photos/301",
      user: "pixuser", user_id: 9, tags: "himalaya, snow, nature",
      largeImageURL: "https://px/large.jpg", webformatURL: "https://px/web.jpg", webformatWidth: 640, webformatHeight: 426,
      previewURL: "https://px/prev.jpg",
    },
  ],
};
const PIXABAY_VIDEOS = { hits: [] };

function mockFetch(): FetchLike {
  return vi.fn(async (url: string) => {
    let body: any = {};
    if (url.includes("api.pexels.com/v1/search")) body = PEXELS_PHOTOS;
    else if (url.includes("api.pexels.com/videos/search")) body = PEXELS_VIDEOS;
    else if (url.includes("pixabay.com/api/videos")) body = PIXABAY_VIDEOS;
    else if (url.includes("pixabay.com/api/")) body = PIXABAY_PHOTOS;
    return { ok: true, status: 200, json: async () => body, arrayBuffer: async () => new ArrayBuffer(8) };
  }) as unknown as FetchLike;
}

describe("stockmedia — helpers", () => {
  it("classifies orientation", () => {
    expect(orientationOf(1920, 1080)).toBe("landscape");
    expect(orientationOf(1080, 1920)).toBe("portrait");
    expect(orientationOf(1000, 1000)).toBe("square");
  });
  it("news-safety heuristic flags people/brands", () => {
    expect(isNewsSafe(["mountain", "sunrise"])).toBe(true);
    expect(isNewsSafe(["portrait", "woman"])).toBe(false);
    expect(isNewsSafe(["logo", "building"])).toBe(false);
  });
});

describe("stockmedia — search + normalize", () => {
  const client = () => createStockMedia({ pexelsKey: "pk", pixabayKey: "xk", fetch: mockFetch(), cacheTtlMs: 0 });

  it("normalizes both providers to one shape with licence + attribution", async () => {
    const r = await client().search("himalaya");
    const byId = Object.fromEntries(r.assets.map((a) => [a.id, a]));
    const photo = byId["pexels:101"]!;
    expect(photo.provider).toBe("pexels");
    expect(photo.type).toBe("photo");
    expect(photo.licence).toBe("Pexels License");
    expect(photo.attributionText).toBe("Photo by Jane Doe on Pexels");
    expect(photo.downloadUrl).toBe("https://img/orig.jpg");
    expect(photo.safeForNews).toBe(true);

    const video = byId["pexels:201"]!;
    expect(video.type).toBe("video");
    expect(video.duration).toBe(12);
    expect(video.attributionText).toBe("Video by Reel Co on Pexels");
    expect(video.files[0]!.url).toBe("https://v/hd.mp4"); // largest first

    const px = byId["pixabay:301"]!;
    expect(px.provider).toBe("pixabay");
    expect(px.licence).toBe("Pixabay Content License");
    expect(px.tags).toContain("himalaya");
  });

  it("flags a portrait of a person as not news-safe", async () => {
    const r = await client().search("people");
    expect(r.assets.find((a) => a.id === "pexels:102")!.safeForNews).toBe(false);
  });

  it("applies filters (orientation, min width, duration, news-safe)", async () => {
    const landscape = await client().search("x", { type: "photo", orientation: "landscape" });
    expect(landscape.assets.every((a) => a.orientation === "landscape")).toBe(true);
    expect(landscape.assets.some((a) => a.id === "pexels:102")).toBe(false); // portrait dropped

    const big = await client().search("x", { type: "photo", minWidth: 4500 });
    expect(big.assets.map((a) => a.id)).toEqual(["pixabay:301"]); // only the 5000px one

    const safe = await client().search("x", { type: "photo", newsSafeOnly: true });
    expect(safe.assets.some((a) => a.id === "pexels:102")).toBe(false);

    const shortVid = await client().search("x", { type: "video", maxDuration: 10 });
    expect(shortVid.assets.length).toBe(0); // the only video is 12s
  });

  it("restricts to one provider", async () => {
    const r = await client().search("x", { provider: "pixabay", type: "photo" });
    expect(r.assets.every((a) => a.provider === "pixabay")).toBe(true);
  });

  it("warns (not throws) when a key is missing", async () => {
    const r = await createStockMedia({ pexelsKey: "pk", fetch: mockFetch(), cacheTtlMs: 0 })
      .search("x", { type: "photo" });
    expect(r.warnings.some((w) => w.includes("pixabay: no API key"))).toBe(true);
    expect(r.assets.some((a) => a.provider === "pexels")).toBe(true);
  });

  it("caches identical searches", async () => {
    const f = mockFetch();
    const c = createStockMedia({ pexelsKey: "pk", fetch: f, cacheTtlMs: 60_000 });
    await c.search("same", { type: "photo", provider: "pexels" });
    await c.search("same", { type: "photo", provider: "pexels" });
    expect((f as any).mock.calls.length).toBe(1); // second served from cache
  });

  it("pickRendition returns the smallest rendition meeting a min width", async () => {
    const r = await client().search("x", { type: "video", provider: "pexels" });
    const v = r.assets[0]!;
    expect(createStockMedia({ fetch: mockFetch() }).pickRendition(v, 1000)!.url).toBe("https://v/hd.mp4");
    expect(createStockMedia({ fetch: mockFetch() }).pickRendition(v, 500)!.url).toBe("https://v/sd.mp4");
  });

  it("download returns bytes via the injected fetch", async () => {
    const r = await client().search("x", { type: "photo", provider: "pexels" });
    const bytes = await client().download(r.assets[0]!);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(8);
  });
});

describe("stockmedia — key pool", () => {
  it("round-robins pooled keys across calls", async () => {
    const seen: string[] = [];
    const f: FetchLike = (async (url: string, init?: any) => {
      if (url.includes("pexels")) seen.push(init.headers.Authorization);
      return { ok: true, status: 200, json: async () => PEXELS_PHOTOS, arrayBuffer: async () => new ArrayBuffer(0) };
    }) as any;
    const c = createStockMedia({ pexelsKey: ["k1", "k2"], fetch: f, cacheTtlMs: 0 });
    await c.search("a", { type: "photo", provider: "pexels" });
    await c.search("b", { type: "photo", provider: "pexels" });
    expect(seen).toEqual(["k1", "k2"]);
  });
});
