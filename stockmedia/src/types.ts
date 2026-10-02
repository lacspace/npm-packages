export type MediaType = "photo" | "video";
export type Provider = "pexels" | "pixabay";
export type Orientation = "landscape" | "portrait" | "square";

export interface StockFile {
  url: string;
  width: number;
  height: number;
  /** Provider quality label (hd / large / medium …), when given. */
  quality?: string;
  fileType?: string;
  sizeBytes?: number;
}

export interface StockAsset {
  /** Stable, provider-qualified id (e.g. "pexels:12345"). */
  id: string;
  provider: Provider;
  type: MediaType;
  width: number;
  height: number;
  /** Seconds — video only. */
  duration?: number;
  orientation: Orientation;
  /** Small preview image URL. */
  thumb: string;
  /** Available renditions, largest first. */
  files: StockFile[];
  /** The best (largest) download URL. */
  downloadUrl: string;
  author: string;
  authorUrl: string;
  /** The asset's page on the provider (for credit links). */
  sourceUrl: string;
  /** Human licence name (e.g. "Pexels License"). */
  licence: string;
  /** One-line credit, short enough for a video description. */
  attributionText: string;
  tags: string[];
  /**
   * Heuristic: likely safe to use as news b-roll — no obvious identifiable
   * people or brand/logo cues in the tags/description. NOT a guarantee (the
   * stock APIs expose no face/logo detection); always have an editor confirm
   * when a shot could show a real person or brand.
   */
  safeForNews: boolean;
}

export interface SearchOptions {
  /** "photo", "video", or "both" (default "both"). */
  type?: MediaType | "both";
  /** Restrict to one provider, or "both" (default "both"). */
  provider?: Provider | "both";
  orientation?: Orientation;
  minWidth?: number;
  minHeight?: number;
  /** Video duration bounds, seconds. */
  minDuration?: number;
  maxDuration?: number;
  /** Filter out unsafe results where the provider supports it. Default true. */
  safeSearch?: boolean;
  /** Results per provider+type request (default 15). */
  perPage?: number;
  page?: number;
  /** Only return assets flagged safeForNews. Default false. */
  newsSafeOnly?: boolean;
  signal?: AbortSignal;
}

export interface SearchResult {
  query: string;
  assets: StockAsset[];
  providers: Provider[];
  /** Per-provider errors (e.g. missing key, rate limit), if any. */
  warnings: string[];
}

export type FetchLike = (url: string, init?: {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}) => Promise<{ ok: boolean; status: number; json(): Promise<any>; arrayBuffer(): Promise<ArrayBuffer> }>;
