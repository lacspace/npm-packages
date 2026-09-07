/**
 * A few more schema.org JSON-LD builders that round out the core set —
 * Dataset, Book and PodcastEpisode. Same style & return shape as the builders
 * in `index.ts` (a cleaned `@context`-carrying object). Zero-dependency.
 */

type Json = Record<string, unknown>;

function prune(obj: Json): Json {
  const out: Json = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

export interface DatasetInput {
  name: string;
  description: string;
  url?: string;
  identifier?: string;
  license?: string;
  keywords?: string[];
  creator?: { name: string; url?: string };
  /** Downloadable distributions of the data. */
  distribution?: { contentUrl: string; encodingFormat?: string }[];
}

/** A Dataset node — for open-data / dataset pages (Google Dataset Search). */
export function dataset(o: DatasetInput): Json {
  return prune({
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: o.name,
    description: o.description,
    url: o.url,
    identifier: o.identifier,
    license: o.license,
    keywords: o.keywords,
    creator: o.creator
      ? prune({ "@type": "Organization", name: o.creator.name, url: o.creator.url })
      : undefined,
    distribution: o.distribution?.map((d) =>
      prune({ "@type": "DataDownload", contentUrl: d.contentUrl, encodingFormat: d.encodingFormat }),
    ),
  });
}

export interface BookInput {
  name: string;
  author: string | { name: string; url?: string };
  url?: string;
  isbn?: string;
  datePublished?: string;
  publisher?: string;
  numberOfPages?: number;
  bookFormat?: "EBook" | "Hardcover" | "Paperback" | "AudiobookFormat";
  inLanguage?: string;
}

/** A Book node — for book / publication pages. */
export function book(o: BookInput): Json {
  const author =
    typeof o.author === "string"
      ? { "@type": "Person", name: o.author }
      : prune({ "@type": "Person", name: o.author.name, url: o.author.url });
  return prune({
    "@context": "https://schema.org",
    "@type": "Book",
    name: o.name,
    author,
    url: o.url,
    isbn: o.isbn,
    datePublished: o.datePublished,
    publisher: o.publisher ? { "@type": "Organization", name: o.publisher } : undefined,
    numberOfPages: o.numberOfPages,
    bookFormat: o.bookFormat ? `https://schema.org/${o.bookFormat}` : undefined,
    inLanguage: o.inLanguage,
  });
}

export interface PodcastEpisodeInput {
  name: string;
  url?: string;
  description?: string;
  datePublished?: string;
  /** ISO-8601 duration, e.g. "PT42M". */
  duration?: string;
  episodeNumber?: number;
  /** Direct audio file URL. */
  audioUrl?: string;
  /** Name of the parent podcast series. */
  seriesName?: string;
}

/** A PodcastEpisode node — for podcast episode pages. */
export function podcastEpisode(o: PodcastEpisodeInput): Json {
  return prune({
    "@context": "https://schema.org",
    "@type": "PodcastEpisode",
    name: o.name,
    url: o.url,
    description: o.description,
    datePublished: o.datePublished,
    timeRequired: o.duration,
    episodeNumber: o.episodeNumber,
    associatedMedia: o.audioUrl
      ? { "@type": "MediaObject", contentUrl: o.audioUrl }
      : undefined,
    partOfSeries: o.seriesName
      ? { "@type": "PodcastSeries", name: o.seriesName }
      : undefined,
  });
}
