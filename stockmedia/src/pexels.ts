import { FetchLike, MediaType, SearchOptions, StockAsset, StockFile } from "./types.js";
import { attribution, isNewsSafe, orientationOf, splitTags } from "./common.js";

const LICENCE = "Pexels License";

function orientationParam(o?: string): string {
  return o === "portrait" ? "portrait" : o === "square" ? "square" : o === "landscape" ? "landscape" : "";
}

function buildUrl(base: string, params: Record<string, string | number | undefined>): string {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") u.searchParams.set(k, String(v));
  return u.toString();
}

/** Fetch + normalize Pexels photos or videos. Throws on a non-ok HTTP status. */
export async function pexelsSearch(
  type: MediaType,
  query: string,
  key: string,
  fetchImpl: FetchLike,
  opts: SearchOptions,
): Promise<StockAsset[]> {
  const base = type === "video" ? "https://api.pexels.com/videos/search" : "https://api.pexels.com/v1/search";
  const url = buildUrl(base, {
    query,
    per_page: opts.perPage ?? 15,
    page: opts.page ?? 1,
    orientation: orientationParam(opts.orientation),
  });
  const res = await fetchImpl(url, { headers: { Authorization: key }, signal: opts.signal });
  if (!res.ok) throw new Error(`pexels ${res.status}`);
  const data = await res.json();
  return type === "video" ? (data.videos ?? []).map(normVideo) : (data.photos ?? []).map(normPhoto);
}

function normPhoto(p: any): StockAsset {
  const src = p.src ?? {};
  const files: StockFile[] = [src.original, src.large2x, src.large, src.medium]
    .filter(Boolean)
    .map((url: string) => ({ url, width: p.width, height: p.height }));
  const tags = splitTags(p.alt);
  return {
    id: `pexels:${p.id}`,
    provider: "pexels",
    type: "photo",
    width: p.width,
    height: p.height,
    orientation: orientationOf(p.width, p.height),
    thumb: src.medium ?? src.small ?? src.tiny ?? src.original,
    files,
    downloadUrl: src.original ?? files[0]?.url ?? "",
    author: p.photographer ?? "",
    authorUrl: p.photographer_url ?? "",
    sourceUrl: p.url ?? "",
    licence: LICENCE,
    attributionText: attribution("photo", p.photographer ?? "", "pexels"),
    tags,
    safeForNews: isNewsSafe(tags),
  };
}

function normVideo(v: any): StockAsset {
  const files: StockFile[] = (v.video_files ?? [])
    .map((f: any) => ({ url: f.link, width: f.width ?? 0, height: f.height ?? 0, quality: f.quality, fileType: f.file_type }))
    .sort((a: StockFile, b: StockFile) => b.width - a.width);
  const best = files[0];
  // Pexels videos carry no tags; the query is the only textual cue.
  const tags = splitTags(v.tags ? (Array.isArray(v.tags) ? v.tags.join(" ") : v.tags) : "");
  return {
    id: `pexels:${v.id}`,
    provider: "pexels",
    type: "video",
    width: v.width ?? best?.width ?? 0,
    height: v.height ?? best?.height ?? 0,
    duration: v.duration,
    orientation: orientationOf(v.width ?? best?.width ?? 0, v.height ?? best?.height ?? 1),
    thumb: v.image ?? "",
    files,
    downloadUrl: best?.url ?? "",
    author: v.user?.name ?? "",
    authorUrl: v.user?.url ?? "",
    sourceUrl: v.url ?? "",
    licence: LICENCE,
    attributionText: attribution("video", v.user?.name ?? "", "pexels"),
    tags,
    safeForNews: isNewsSafe(tags),
  };
}
