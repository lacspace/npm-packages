import { Mood, Track } from "./library.js";

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

export type MusicOrder = "trending" | "trending_month" | "popular" | "newest" | "relevance";

export interface MusicSearchOptions {
  query?: string;
  mood?: Mood;
  /** Minimum duration, seconds. */
  minDuration?: number;
  maxDuration?: number;
  /** "trending" = most popular overall (the closest safe analogue to platform trends). */
  order?: MusicOrder;
  limit?: number;
  /** Only tracks that allow direct download (bakeable into a render). Default true. */
  downloadableOnly?: boolean;
  fetch?: FetchLike;
  signal?: AbortSignal;
}

export interface MusicResult {
  tracks: Track[];
  warnings: string[];
}

// --- Jamendo (Creative-Commons music, official API) --------------------------------
const JAMENDO_ORDER: Record<MusicOrder, string> = {
  trending: "popularity_total",
  trending_month: "popularity_month",
  popular: "listens_total",
  newest: "releasedate_desc",
  relevance: "relevance",
};

function ccName(url: string | undefined): string {
  if (!url) return "Creative Commons";
  const m = url.match(/licenses\/([a-z-]+)\/(\d\.\d)/i);
  if (!m) return "Creative Commons";
  return `CC ${m[1]!.toUpperCase()} ${m[2]}`;
}

function moodFromJamendo(info: any): Mood {
  const vartags: string[] = info?.tags?.vartags ?? [];
  const tags = vartags.map((t) => String(t).toLowerCase());
  if (tags.some((t) => /tense|dark|dramatic|urgent|epic/.test(t))) return "breaking";
  if (tags.some((t) => /calm|relax|ambient|slow|sad|peaceful/.test(t))) return "calm";
  if (tags.some((t) => /energetic|happy|upbeat|fast|motivational|dance/.test(t))) return "energetic";
  const speed = String(info?.speed ?? "");
  if (/high/.test(speed)) return "energetic";
  if (/low/.test(speed)) return "calm";
  return "neutral";
}

function normJamendo(t: any): Track {
  const licence = ccName(t.license_ccurl);
  const author = t.artist_name ?? "Unknown";
  const title = t.name ?? "Untitled";
  const genres: string[] = t.musicinfo?.tags?.genres ?? [];
  return {
    path: t.audiodownload || t.audio, // ffmpeg can read the URL directly
    mood: moodFromJamendo(t.musicinfo),
    duration: t.duration ? Number(t.duration) : undefined,
    tags: genres.map(String),
    licence: {
      title,
      author,
      licence: licence,
      url: t.shareurl,
      attribution: `Music: "${title}" by ${author} — ${licence} (Jamendo${t.shareurl ? `, ${t.shareurl}` : ""})`,
    },
  };
}

/**
 * Search free, Creative-Commons music you can legally mix into a rendered upload — the
 * Jamendo API (bring your own `client_id`). Returns tracks in the same shape as the local
 * library, each with its CC licence + a ready attribution line, orderable by popularity
 * ("trending"). This is the safe alternative to platform "trending sounds", which are
 * licensed only inside the platforms' own editors and get Content-ID-claimed when baked
 * into an API upload. Deterministic, bring-your-own-fetch.
 */
export async function searchFreeMusic(
  clientId: string,
  options: MusicSearchOptions = {},
): Promise<MusicResult> {
  const fetchImpl = (options.fetch ?? (globalThis as any).fetch) as FetchLike | undefined;
  if (!fetchImpl) return { tracks: [], warnings: ["no fetch available — pass options.fetch"] };
  if (!clientId) return { tracks: [], warnings: ["jamendo: no client_id"] };

  const u = new URL("https://api.jamendo.com/v3.0/tracks/");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("format", "json");
  u.searchParams.set("limit", String(options.limit ?? 20));
  u.searchParams.set("include", "musicinfo");
  u.searchParams.set("audioformat", "mp32");
  u.searchParams.set("order", JAMENDO_ORDER[options.order ?? "trending"]);
  if (options.query) u.searchParams.set("search", options.query);
  if (options.downloadableOnly !== false) u.searchParams.set("audiodlallowed", "true");
  if (options.minDuration) u.searchParams.set("durationbetween", `${options.minDuration}_${options.maxDuration ?? 600}`);

  let data: any;
  try {
    const res = await fetchImpl(u.toString(), { signal: options.signal });
    if (!res.ok) return { tracks: [], warnings: [`jamendo ${res.status}`] };
    data = await res.json();
  } catch (e) {
    return { tracks: [], warnings: [`jamendo: ${(e as Error).message}`] };
  }

  let tracks = (data.results ?? []).map(normJamendo).filter((t: Track) => t.path);
  if (options.mood) tracks = tracks.filter((t: Track) => t.mood === options.mood);
  if (options.minDuration) tracks = tracks.filter((t: Track) => (t.duration ?? Infinity) >= options.minDuration!);
  if (options.maxDuration) tracks = tracks.filter((t: Track) => (t.duration ?? 0) <= options.maxDuration!);
  return { tracks, warnings: [] };
}

/** Trending free music — `searchFreeMusic` ordered by overall popularity. */
export function trendingFreeMusic(clientId: string, options: MusicSearchOptions = {}): Promise<MusicResult> {
  return searchFreeMusic(clientId, { ...options, order: options.order ?? "trending" });
}
