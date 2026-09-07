/**
 * Richer Open Graph & Twitter meta builders — the product, profile, video and
 * audio Open Graph objects plus the Twitter `summary` / `player` / `app` card
 * variants that the flat {@link import("./index").seoMetadata} shape doesn't
 * cover. Each returns a flat `property → content` map; {@link metaTags} renders
 * any number of maps to `<meta>` tag strings for any framework.
 *
 * Zero-dependency & isomorphic — additive to the existing OG/Twitter output.
 */

export type MetaValue = string | number | boolean | string[] | undefined;
export type MetaMap = Record<string, MetaValue>;

function prune(map: MetaMap): MetaMap {
  const out: MetaMap = {};
  for (const [k, v] of Object.entries(map)) {
    if (v === undefined || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

/* ---------------------------------------------------------------- *
 * Open Graph objects
 * ---------------------------------------------------------------- */

export interface OgArticleInput {
  title?: string;
  description?: string;
  url?: string;
  image?: string;
  siteName?: string;
  locale?: string;
  publishedTime?: string;
  modifiedTime?: string;
  expirationTime?: string;
  author?: string | string[];
  section?: string;
  tags?: string[];
}

/** Open Graph `article` object (author/section/published/modified/tags). */
export function openGraphArticle(o: OgArticleInput): MetaMap {
  return prune({
    "og:type": "article",
    "og:title": o.title,
    "og:description": o.description,
    "og:url": o.url,
    "og:image": o.image,
    "og:site_name": o.siteName,
    "og:locale": o.locale,
    "article:published_time": o.publishedTime,
    "article:modified_time": o.modifiedTime,
    "article:expiration_time": o.expirationTime,
    "article:author": o.author,
    "article:section": o.section,
    "article:tag": o.tags,
  });
}

export interface OgProductInput {
  title?: string;
  description?: string;
  url?: string;
  image?: string;
  siteName?: string;
  price?: number | string;
  currency?: string;
  availability?: "instock" | "oos" | "outofstock" | "preorder" | "backorder" | "discontinued";
  brand?: string;
  retailerItemId?: string;
  condition?: "new" | "refurbished" | "used";
}

/** Open Graph `product` object (price/currency/availability/brand/condition). */
export function openGraphProduct(o: OgProductInput): MetaMap {
  return prune({
    "og:type": "product",
    "og:title": o.title,
    "og:description": o.description,
    "og:url": o.url,
    "og:image": o.image,
    "og:site_name": o.siteName,
    "product:price:amount": o.price !== undefined ? String(o.price) : undefined,
    "product:price:currency": o.currency,
    "product:availability": o.availability,
    "product:brand": o.brand,
    "product:retailer_item_id": o.retailerItemId,
    "product:condition": o.condition,
  });
}

export interface OgProfileInput {
  title?: string;
  description?: string;
  url?: string;
  image?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  gender?: "male" | "female";
}

/** Open Graph `profile` object (first_name/last_name/username/gender). */
export function openGraphProfile(o: OgProfileInput): MetaMap {
  return prune({
    "og:type": "profile",
    "og:title": o.title,
    "og:description": o.description,
    "og:url": o.url,
    "og:image": o.image,
    "profile:first_name": o.firstName,
    "profile:last_name": o.lastName,
    "profile:username": o.username,
    "profile:gender": o.gender,
  });
}

export interface OgVideoInput {
  title?: string;
  description?: string;
  url?: string;
  image?: string;
  videoUrl: string;
  secureUrl?: string;
  /** MIME type, defaults to "video/mp4". */
  videoType?: string;
  width?: number;
  height?: number;
  /** Duration in seconds. */
  duration?: number;
  releaseDate?: string;
  tags?: string[];
}

/** Open Graph `video.other` object (og:video + dimensions/duration/tags). */
export function openGraphVideo(o: OgVideoInput): MetaMap {
  return prune({
    "og:type": "video.other",
    "og:title": o.title,
    "og:description": o.description,
    "og:url": o.url,
    "og:image": o.image,
    "og:video": o.videoUrl,
    "og:video:secure_url": o.secureUrl,
    "og:video:type": o.videoType ?? "video/mp4",
    "og:video:width": o.width,
    "og:video:height": o.height,
    "video:duration": o.duration,
    "video:release_date": o.releaseDate,
    "video:tag": o.tags,
  });
}

export interface OgAudioInput {
  title?: string;
  description?: string;
  url?: string;
  audioUrl: string;
  secureUrl?: string;
  /** MIME type, defaults to "audio/mpeg". */
  audioType?: string;
}

/** Open Graph audio properties (og:audio + secure_url + type). */
export function openGraphAudio(o: OgAudioInput): MetaMap {
  return prune({
    "og:title": o.title,
    "og:description": o.description,
    "og:url": o.url,
    "og:audio": o.audioUrl,
    "og:audio:secure_url": o.secureUrl,
    "og:audio:type": o.audioType ?? "audio/mpeg",
  });
}

/* ---------------------------------------------------------------- *
 * Twitter card variants
 * ---------------------------------------------------------------- */

export interface TwitterSummaryInput {
  title?: string;
  description?: string;
  image?: string;
  imageAlt?: string;
  site?: string;
  creator?: string;
  /** Use the large-image variant. */
  largeImage?: boolean;
}

/** Twitter `summary` / `summary_large_image` card. */
export function twitterSummaryCard(o: TwitterSummaryInput): MetaMap {
  return prune({
    "twitter:card": o.largeImage ? "summary_large_image" : "summary",
    "twitter:title": o.title,
    "twitter:description": o.description,
    "twitter:image": o.image,
    "twitter:image:alt": o.imageAlt,
    "twitter:site": o.site,
    "twitter:creator": o.creator,
  });
}

export interface TwitterPlayerInput {
  title?: string;
  description?: string;
  image?: string;
  site?: string;
  /** HTTPS URL of the player iframe. */
  player: string;
  width: number;
  height: number;
  /** Direct stream URL (optional). */
  stream?: string;
}

/** Twitter `player` card (embedded video/audio player). */
export function twitterPlayerCard(o: TwitterPlayerInput): MetaMap {
  return prune({
    "twitter:card": "player",
    "twitter:title": o.title,
    "twitter:description": o.description,
    "twitter:image": o.image,
    "twitter:site": o.site,
    "twitter:player": o.player,
    "twitter:player:width": o.width,
    "twitter:player:height": o.height,
    "twitter:player:stream": o.stream,
  });
}

export interface TwitterAppInput {
  site?: string;
  description?: string;
  country?: string;
  iphone?: { id: string; name?: string; url?: string };
  ipad?: { id: string; name?: string; url?: string };
  googleplay?: { id: string; name?: string; url?: string };
}

/** Twitter `app` card (deep-link into native iOS/Android apps). */
export function twitterAppCard(o: TwitterAppInput): MetaMap {
  return prune({
    "twitter:card": "app",
    "twitter:site": o.site,
    "twitter:description": o.description,
    "twitter:app:country": o.country,
    "twitter:app:id:iphone": o.iphone?.id,
    "twitter:app:name:iphone": o.iphone?.name,
    "twitter:app:url:iphone": o.iphone?.url,
    "twitter:app:id:ipad": o.ipad?.id,
    "twitter:app:name:ipad": o.ipad?.name,
    "twitter:app:url:ipad": o.ipad?.url,
    "twitter:app:id:googleplay": o.googleplay?.id,
    "twitter:app:name:googleplay": o.googleplay?.name,
    "twitter:app:url:googleplay": o.googleplay?.url,
  });
}

/* ---------------------------------------------------------------- *
 * Rendering
 * ---------------------------------------------------------------- */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Twitter uses `name=`; Open Graph and its extensions use `property=`. */
function attrFor(key: string): "property" | "name" {
  if (key.startsWith("twitter:")) return "name";
  if (/^(og|article|product|profile|music|video|book|fb):/.test(key)) return "property";
  return "name";
}

/**
 * Render one or more meta maps to `<meta>` tag strings. Array values emit one
 * tag each (e.g. multiple `article:tag`). Content is HTML-escaped.
 * @example metaTags(openGraphProduct({ price: 9, currency: "USD" }), twitterSummaryCard({ largeImage: true }))
 */
export function metaTags(...maps: MetaMap[]): string {
  const parts: string[] = [];
  for (const map of maps) {
    for (const [k, v] of Object.entries(prune(map))) {
      const attr = attrFor(k);
      const items = Array.isArray(v) ? v : [v as string | number | boolean];
      for (const item of items) {
        parts.push(`<meta ${attr}="${esc(k)}" content="${esc(String(item))}">`);
      }
    }
  }
  return parts.join("\n");
}
