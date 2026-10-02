export type Mood = "calm" | "energetic" | "breaking" | "neutral";

export interface TrackLicence {
  title: string;
  author: string;
  /** Licence name, e.g. "CC BY 4.0", "CC0". */
  licence: string;
  url?: string;
  /** A ready-to-use credit line. Built if absent. */
  attribution: string;
}

export interface Track {
  /** Absolute or caller-relative path to the audio file. */
  path: string;
  mood: Mood;
  /** Beats per minute, if known (from metadata). */
  bpm?: number;
  /** Duration in seconds, if known. */
  duration?: number;
  licence: TrackLicence;
  tags: string[];
}

/** Build a one-line credit from licence fields (Kevin MacLeod-style when matched). */
export function buildAttribution(l: { title: string; author: string; licence: string; url?: string }): string {
  const incompetech = /kevin\s*macleod/i.test(l.author);
  if (incompetech) {
    return `Music: ${l.title} by Kevin MacLeod (incompetech.com) — Licensed under ${l.licence}`;
  }
  const url = l.url ? ` (${l.url})` : "";
  return `"${l.title}" by ${l.author}${url} — ${l.licence}`;
}

/**
 * Parse a licence sidecar. Accepts JSON ({title,author,licence,url,mood,bpm,duration,
 * tags}) or a simple "Key: value" text block. Returns the licence + any track metadata.
 */
export function parseLicence(raw: string): { licence: TrackLicence; mood?: Mood; bpm?: number; duration?: number; tags?: string[] } {
  const trimmed = raw.trim();
  let obj: Record<string, any> = {};
  if (trimmed.startsWith("{")) {
    try {
      obj = JSON.parse(trimmed);
    } catch {
      obj = {};
    }
  } else {
    for (const line of trimmed.split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z ]+):\s*(.+)$/);
      if (m) obj[m[1]!.trim().toLowerCase()] = m[2]!.trim();
    }
  }
  const title = obj.title ?? "Untitled";
  const author = obj.author ?? obj.artist ?? "Unknown";
  const licence = obj.licence ?? obj.license ?? "Unknown licence";
  const url = obj.url ?? obj.link;
  const attribution = obj.attribution ?? buildAttribution({ title, author, licence, url });
  const tags = Array.isArray(obj.tags)
    ? obj.tags.map(String)
    : typeof obj.tags === "string"
      ? obj.tags.split(/[,\s]+/).filter(Boolean)
      : undefined;
  return {
    licence: { title, author, licence, url, attribution },
    mood: normalizeMood(obj.mood),
    bpm: obj.bpm ? Number(obj.bpm) : undefined,
    duration: obj.duration ? Number(obj.duration) : undefined,
    tags,
  };
}

function normalizeMood(m: unknown): Mood | undefined {
  const s = String(m ?? "").toLowerCase();
  if (s === "calm" || /slow|ambient|soft|sad/.test(s)) return "calm";
  if (s === "energetic" || /upbeat|fast|happy|drive/.test(s)) return "energetic";
  if (s === "breaking" || /tense|urgent|news|dramatic/.test(s)) return "breaking";
  if (s === "neutral") return "neutral";
  return undefined;
}

export interface PickCriteria {
  mood?: Mood;
  /** The track must be at least this long (seconds), when duration is known. */
  minDuration?: number;
  /** Deterministic rotation index, so repeated picks vary without randomness. */
  rotate?: number;
}

/** Choose the best-matching track deterministically (no RNG). */
export function pickTrack(tracks: Track[], criteria: PickCriteria = {}): Track | undefined {
  const pool = tracks.filter((t) => {
    if (criteria.mood && t.mood !== criteria.mood) return false;
    if (criteria.minDuration && t.duration !== undefined && t.duration < criteria.minDuration) return false;
    return true;
  });
  const list = pool.length ? pool : tracks.filter((t) => !criteria.minDuration || (t.duration ?? Infinity) >= criteria.minDuration);
  if (!list.length) return undefined;
  const sorted = [...list].sort((a, b) => a.path.localeCompare(b.path));
  return sorted[(criteria.rotate ?? 0) % sorted.length];
}

const AUDIO_EXT = /\.(mp3|m4a|aac|wav|flac|ogg|opus)$/i;

/** Scan a directory for audio files that each carry a licence sidecar (Node only). */
export async function loadLibrary(dir: string): Promise<Track[]> {
  const { readdir, readFile, stat } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const out: Track[] = [];
  async function walk(d: string): Promise<void> {
    for (const name of await readdir(d)) {
      const p = join(d, name);
      const s = await stat(p);
      if (s.isDirectory()) {
        await walk(p);
        continue;
      }
      if (!AUDIO_EXT.test(name)) continue;
      const stem = p.replace(AUDIO_EXT, "");
      let raw: string | undefined;
      for (const cand of [`${stem}.license.json`, `${stem}.license.txt`, `${p}.LICENSE`, `${stem}.json`]) {
        try {
          raw = await readFile(cand, "utf8");
          break;
        } catch {
          /* next */
        }
      }
      if (!raw) continue; // no licence → never use it (licence-clean only)
      const meta = parseLicence(raw);
      out.push({
        path: p,
        mood: meta.mood ?? "neutral",
        bpm: meta.bpm,
        duration: meta.duration,
        licence: meta.licence,
        tags: meta.tags ?? [],
      });
    }
  }
  await walk(dir);
  return out;
}
