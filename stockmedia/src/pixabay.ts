import { FetchLike, MediaType, SearchOptions, StockAsset, StockFile } from "./types.js";
import { attribution, isNewsSafe, orientationOf, splitTags } from "./common.js";

const LICENCE = "Pixabay Content License";

function orientationParam(o?: string): string {
  // Pixabay has no "square"; "all" is the default.
  return o === "portrait" ? "vertical" : o === "landscape" ? "horizontal" : "all";
}

function buildUrl(base: string, params: Record<string, string | number | boolean | undefined>): string {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") u.searchParams.set(k, String(v));
  return u.toString();
}

export async function pixabaySearch(
  type: MediaType,
  query: string,
  key: string,
  fetchImpl: FetchLike,
  opts: SearchOptions,
): Promise<StockAsset[]> {
  const base = type === "video" ? "https://pixabay.com/api/videos/" : "https://pixabay.com/api/";
  const url = buildUrl(base, {
    key,
    q: query,
    per_page: Math.min(Math.max(opts.perPage ?? 15, 3), 200),
    page: opts.page ?? 1,
    orientation: type === "photo" ? orientationParam(opts.orientation) : undefined,
    image_type: type === "photo" ? "photo" : undefined,
    safesearch: (opts.safeSearch ?? true) ? "true" : "false",
    min_width: opts.minWidth,
    min_height: opts.minHeight,
  });
  const res = await fetchImpl(url, { signal: opts.signal });
  if (!res.ok) throw new Error(`pixabay ${res.status}`);
  const data = await res.json();
  return (data.hits ?? []).map(type === "video" ? normVideo : normPhoto);
}

function normPhoto(h: any): StockAsset {
  const files: StockFile[] = [
    h.fullHDURL && { url: h.fullHDURL, width: h.imageWidth, height: h.imageHeight, quality: "fullhd" },
    h.largeImageURL && { url: h.largeImageURL, width: h.imageWidth, height: h.imageHeight, quality: "large" },
    h.webformatURL && { url: h.webformatURL, width: h.webformatWidth, height: h.webformatHeight, quality: "web" },
  ].filter(Boolean) as StockFile[];
  const tags = splitTags(h.tags);
  return {
    id: `pixabay:${h.id}`,
    provider: "pixabay",
    type: "photo",
    width: h.imageWidth ?? 0,
    height: h.imageHeight ?? 0,
    orientation: orientationOf(h.imageWidth ?? 0, h.imageHeight ?? 1),
    thumb: h.previewURL ?? h.webformatURL ?? "",
    files,
    downloadUrl: h.largeImageURL ?? h.webformatURL ?? "",
    author: h.user ?? "",
    authorUrl: h.user ? `https://pixabay.com/users/${h.user}-${h.user_id}/` : "",
    sourceUrl: h.pageURL ?? "",
    licence: LICENCE,
    attributionText: attribution("photo", h.user ?? "", "pixabay"),
    tags,
    safeForNews: isNewsSafe(tags),
  };
}

function normVideo(h: any): StockAsset {
  const v = h.videos ?? {};
  const files: StockFile[] = [v.large, v.medium, v.small, v.tiny]
    .filter(Boolean)
    .map((f: any) => ({ url: f.url, width: f.width ?? 0, height: f.height ?? 0, sizeBytes: f.size, quality: f.quality }))
    .filter((f: StockFile) => f.url)
    .sort((a: StockFile, b: StockFile) => b.width - a.width);
  const best = files[0];
  const tags = splitTags(h.tags);
  return {
    id: `pixabay:${h.id}`,
    provider: "pixabay",
    type: "video",
    width: best?.width ?? 0,
    height: best?.height ?? 0,
    duration: h.duration,
    orientation: orientationOf(best?.width ?? 0, best?.height ?? 1),
    thumb: h.picture_id ? `https://i.vimeocdn.com/video/${h.picture_id}_295x166.jpg` : "",
    files,
    downloadUrl: best?.url ?? "",
    author: h.user ?? "",
    authorUrl: h.user ? `https://pixabay.com/users/${h.user}-${h.user_id}/` : "",
    sourceUrl: h.pageURL ?? "",
    licence: LICENCE,
    attributionText: attribution("video", h.user ?? "", "pixabay"),
    tags,
    safeForNews: isNewsSafe(tags),
  };
}
