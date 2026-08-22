/**
 * @lacspace/seo
 * Typed metadata + JSON-LD for modern web apps.
 *
 * Build valid schema.org JSON-LD objects and Next.js App Router `Metadata`
 * objects with typed one-liners instead of copy-pasting fragile JSON.
 *
 * Zero dependencies · isomorphic · fully typed.
 */

/* ------------------------------------------------------------------ *
 * Metadata (Next.js App Router friendly, framework-agnostic shape)
 * ------------------------------------------------------------------ */

export interface OpenGraph {
  title?: string;
  description?: string;
  url?: string;
  siteName?: string;
  type?: "website" | "article" | "profile";
  locale?: string;
  images?: { url: string; width?: number; height?: number; alt?: string }[];
  publishedTime?: string;
  modifiedTime?: string;
  authors?: string[];
  section?: string;
  tags?: string[];
}

export interface TwitterMeta {
  card: "summary" | "summary_large_image";
  title?: string;
  description?: string;
  images?: string[];
  site?: string;
  creator?: string;
}

export interface Metadata {
  title?: string;
  description?: string;
  keywords?: string[];
  alternates?: { canonical?: string; languages?: Record<string, string> };
  openGraph?: OpenGraph;
  twitter?: TwitterMeta;
  robots?: { index: boolean; follow: boolean };
}

export interface SeoInput {
  title: string;
  description?: string;
  /** Path ("/pricing") or absolute URL. Resolved against `baseUrl`. */
  canonical?: string;
  /** Social share image URL (absolute recommended). */
  image?: string;
  imageAlt?: string;
  imageWidth?: number;
  imageHeight?: number;
  keywords?: string[];
  siteName?: string;
  type?: "website" | "article" | "profile";
  locale?: string;
  twitterCard?: "summary" | "summary_large_image";
  twitterSite?: string;
  twitterCreator?: string;
  noindex?: boolean;
  /** Used to turn a relative `canonical` into an absolute OG url. */
  baseUrl?: string;
  /** Extra Open Graph "article:*" fields (for `type: "article"`). */
  article?: {
    publishedTime?: string;
    modifiedTime?: string;
    authors?: string[];
    section?: string;
    tags?: string[];
  };
  /** i18n alternates → `alternates.languages`. */
  languages?: Record<string, string>;
}

function absolute(path: string | undefined, baseUrl?: string): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  if (!baseUrl) return path;
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

/**
 * Build a Next.js App Router `Metadata` object (title, description, canonical,
 * Open Graph and Twitter) from one flat input. Assign it to `export const metadata`.
 */
export function seoMetadata(input: SeoInput): Metadata {
  const url = absolute(input.canonical, input.baseUrl);
  const image = input.image
    ? [{ url: input.image, width: input.imageWidth, height: input.imageHeight, alt: input.imageAlt }]
    : undefined;
  const alternates =
    input.canonical || input.languages
      ? { canonical: input.canonical, languages: input.languages }
      : undefined;
  const meta: Metadata = {
    title: input.title,
    description: input.description,
    keywords: input.keywords,
    alternates,
    openGraph: {
      title: input.title,
      description: input.description,
      url,
      siteName: input.siteName,
      type: input.type ?? "website",
      locale: input.locale,
      images: image,
      publishedTime: input.article?.publishedTime,
      modifiedTime: input.article?.modifiedTime,
      authors: input.article?.authors,
      section: input.article?.section,
      tags: input.article?.tags,
    },
    twitter: {
      card: input.twitterCard ?? (input.image ? "summary_large_image" : "summary"),
      title: input.title,
      description: input.description,
      images: input.image ? [input.image] : undefined,
      site: input.twitterSite,
      creator: input.twitterCreator,
    },
  };
  if (input.noindex) meta.robots = { index: false, follow: false };
  return meta;
}

export interface SeoLint {
  ok: boolean;
  warnings: string[];
}

/** Lint an SEO input for common issues (title/description length, missing canonical/image). */
export function lintSeo(input: SeoInput): SeoLint {
  const w: string[] = [];
  if (!input.title) w.push("missing title");
  else {
    if (input.title.length > 60) w.push(`title is ${input.title.length} chars (>60 may be truncated in SERPs)`);
    if (input.title.length < 10) w.push("title is very short (<10 chars)");
  }
  if (!input.description) w.push("missing description");
  else {
    if (input.description.length > 160) w.push(`description is ${input.description.length} chars (>160 may be truncated)`);
    if (input.description.length < 50) w.push("description is short (<50 chars)");
  }
  if (!input.canonical) w.push("no canonical URL");
  if (!input.image) w.push("no social share image (og:image)");
  return { ok: w.length === 0, warnings: w };
}

/* ------------------------------------------------------------------ *
 * JSON-LD builders (schema.org)
 * ------------------------------------------------------------------ */

type Json = Record<string, unknown>;

function clean(obj: Json): Json {
  const out: Json = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

export interface OrganizationInput {
  name: string;
  url: string;
  logo?: string;
  description?: string;
  sameAs?: string[];
  email?: string;
  telephone?: string;
}

export function organization(o: OrganizationInput): Json {
  return clean({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: o.name,
    url: o.url,
    logo: o.logo,
    description: o.description,
    sameAs: o.sameAs,
    email: o.email,
    telephone: o.telephone,
  });
}

export interface WebsiteInput {
  name: string;
  url: string;
  /** Enables the Sitelinks search box. Use "{search_term_string}" as the query token. */
  searchUrl?: string;
}

export function website(o: WebsiteInput): Json {
  const base: Json = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: o.name,
    url: o.url,
  };
  if (o.searchUrl) {
    base.potentialAction = {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: o.searchUrl },
      "query-input": "required name=search_term_string",
    };
  }
  return base;
}

export interface ArticleInput {
  headline: string;
  description?: string;
  image?: string | string[];
  author: string | { name: string; url?: string };
  datePublished: string;
  dateModified?: string;
  url?: string;
  publisher?: OrganizationInput;
}

export function article(o: ArticleInput): Json {
  const author =
    typeof o.author === "string"
      ? { "@type": "Person", name: o.author }
      : { "@type": "Person", name: o.author.name, url: o.author.url };
  return clean({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: o.headline,
    description: o.description,
    image: o.image,
    author,
    datePublished: o.datePublished,
    dateModified: o.dateModified ?? o.datePublished,
    mainEntityOfPage: o.url,
    publisher: o.publisher
      ? clean({
          "@type": "Organization",
          name: o.publisher.name,
          logo: o.publisher.logo ? { "@type": "ImageObject", url: o.publisher.logo } : undefined,
        })
      : undefined,
  });
}

export interface ProductInput {
  name: string;
  description?: string;
  image?: string | string[];
  brand?: string;
  sku?: string;
  offers?: {
    price: number | string;
    currency: string;
    availability?: "InStock" | "OutOfStock" | "PreOrder";
    url?: string;
  };
  rating?: { value: number; count: number };
}

export function product(o: ProductInput): Json {
  return clean({
    "@context": "https://schema.org",
    "@type": "Product",
    name: o.name,
    description: o.description,
    image: o.image,
    sku: o.sku,
    brand: o.brand ? { "@type": "Brand", name: o.brand } : undefined,
    offers: o.offers
      ? clean({
          "@type": "Offer",
          price: String(o.offers.price),
          priceCurrency: o.offers.currency,
          availability: o.offers.availability
            ? `https://schema.org/${o.offers.availability}`
            : undefined,
          url: o.offers.url,
        })
      : undefined,
    aggregateRating: o.rating
      ? {
          "@type": "AggregateRating",
          ratingValue: o.rating.value,
          reviewCount: o.rating.count,
        }
      : undefined,
  });
}

export function breadcrumb(items: { name: string; url: string }[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

export function faqPage(items: { question: string; answer: string }[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.question,
      acceptedAnswer: { "@type": "Answer", text: it.answer },
    })),
  };
}

export interface SoftwareAppInput {
  name: string;
  description?: string;
  operatingSystem?: string;
  category?: string;
  price?: number | string;
  currency?: string;
  url?: string;
}

export function softwareApp(o: SoftwareAppInput): Json {
  return clean({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: o.name,
    description: o.description,
    operatingSystem: o.operatingSystem,
    applicationCategory: o.category,
    downloadUrl: o.url,
    offers:
      o.price !== undefined
        ? { "@type": "Offer", price: String(o.price), priceCurrency: o.currency ?? "USD" }
        : undefined,
  });
}

export interface PostalAddress {
  street?: string;
  locality?: string;
  region?: string;
  postalCode?: string;
  country?: string;
}

function addressNode(a?: PostalAddress): Json | undefined {
  if (!a) return undefined;
  return clean({
    "@type": "PostalAddress",
    streetAddress: a.street,
    addressLocality: a.locality,
    addressRegion: a.region,
    postalCode: a.postalCode,
    addressCountry: a.country,
  });
}

export interface LocalBusinessInput {
  name: string;
  url?: string;
  image?: string;
  telephone?: string;
  priceRange?: string;
  address?: PostalAddress;
  geo?: { latitude: number; longitude: number };
  openingHours?: string[];
  rating?: { value: number; count: number };
}

export function localBusiness(o: LocalBusinessInput): Json {
  return clean({
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: o.name,
    url: o.url,
    image: o.image,
    telephone: o.telephone,
    priceRange: o.priceRange,
    address: addressNode(o.address),
    geo: o.geo
      ? { "@type": "GeoCoordinates", latitude: o.geo.latitude, longitude: o.geo.longitude }
      : undefined,
    openingHours: o.openingHours,
    aggregateRating: o.rating
      ? { "@type": "AggregateRating", ratingValue: o.rating.value, reviewCount: o.rating.count }
      : undefined,
  });
}

export interface EventInput {
  name: string;
  startDate: string;
  endDate?: string;
  description?: string;
  image?: string;
  url?: string;
  location?: { name?: string; address?: PostalAddress; url?: string };
  online?: boolean;
  offers?: { price: number | string; currency: string; url?: string };
}

export function event(o: EventInput): Json {
  return clean({
    "@context": "https://schema.org",
    "@type": "Event",
    name: o.name,
    startDate: o.startDate,
    endDate: o.endDate,
    description: o.description,
    image: o.image,
    url: o.url,
    eventAttendanceMode: o.online
      ? "https://schema.org/OnlineEventAttendanceMode"
      : "https://schema.org/OfflineEventAttendanceMode",
    location: o.location
      ? o.online
        ? clean({ "@type": "VirtualLocation", url: o.location.url })
        : clean({ "@type": "Place", name: o.location.name, address: addressNode(o.location.address) })
      : undefined,
    offers: o.offers
      ? clean({
          "@type": "Offer",
          price: String(o.offers.price),
          priceCurrency: o.offers.currency,
          url: o.offers.url,
        })
      : undefined,
  });
}

export interface PersonInput {
  name: string;
  url?: string;
  image?: string;
  jobTitle?: string;
  worksFor?: string;
  sameAs?: string[];
}

export function person(o: PersonInput): Json {
  return clean({
    "@context": "https://schema.org",
    "@type": "Person",
    name: o.name,
    url: o.url,
    image: o.image,
    jobTitle: o.jobTitle,
    worksFor: o.worksFor ? { "@type": "Organization", name: o.worksFor } : undefined,
    sameAs: o.sameAs,
  });
}

export interface ReviewInput {
  itemName: string;
  ratingValue: number;
  bestRating?: number;
  author: string;
  body?: string;
  datePublished?: string;
}

export function review(o: ReviewInput): Json {
  return clean({
    "@context": "https://schema.org",
    "@type": "Review",
    itemReviewed: { "@type": "Thing", name: o.itemName },
    reviewRating: clean({
      "@type": "Rating",
      ratingValue: o.ratingValue,
      bestRating: o.bestRating ?? 5,
    }),
    author: { "@type": "Person", name: o.author },
    reviewBody: o.body,
    datePublished: o.datePublished,
  });
}

export interface VideoInput {
  name: string;
  description: string;
  thumbnailUrl: string | string[];
  uploadDate: string;
  duration?: string;
  contentUrl?: string;
  embedUrl?: string;
}

export function videoObject(o: VideoInput): Json {
  return clean({
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: o.name,
    description: o.description,
    thumbnailUrl: o.thumbnailUrl,
    uploadDate: o.uploadDate,
    duration: o.duration,
    contentUrl: o.contentUrl,
    embedUrl: o.embedUrl,
  });
}

export interface HowToInput {
  name: string;
  description?: string;
  totalTime?: string;
  steps: { name?: string; text: string; image?: string; url?: string }[];
}

export function howTo(o: HowToInput): Json {
  return clean({
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: o.name,
    description: o.description,
    totalTime: o.totalTime,
    step: o.steps.map((s, i) =>
      clean({
        "@type": "HowToStep",
        position: i + 1,
        name: s.name,
        text: s.text,
        image: s.image,
        url: s.url,
      }),
    ),
  });
}

export interface JobPostingInput {
  title: string;
  description: string;
  datePosted: string;
  validThrough?: string;
  employmentType?: string;
  hiringOrganization: { name: string; url?: string; logo?: string };
  location?: PostalAddress;
  remote?: boolean;
  salary?: { min: number; max?: number; currency: string; unit?: "HOUR" | "DAY" | "WEEK" | "MONTH" | "YEAR" };
}

export function jobPosting(o: JobPostingInput): Json {
  return clean({
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: o.title,
    description: o.description,
    datePosted: o.datePosted,
    validThrough: o.validThrough,
    employmentType: o.employmentType,
    hiringOrganization: clean({
      "@type": "Organization",
      name: o.hiringOrganization.name,
      sameAs: o.hiringOrganization.url,
      logo: o.hiringOrganization.logo,
    }),
    jobLocationType: o.remote ? "TELECOMMUTE" : undefined,
    jobLocation: o.location
      ? { "@type": "Place", address: addressNode(o.location) }
      : undefined,
    baseSalary: o.salary
      ? {
          "@type": "MonetaryAmount",
          currency: o.salary.currency,
          value: clean({
            "@type": "QuantitativeValue",
            minValue: o.salary.min,
            maxValue: o.salary.max,
            unitText: o.salary.unit ?? "YEAR",
          }),
        }
      : undefined,
  });
}

export interface CourseInput {
  name: string;
  description: string;
  provider: { name: string; url?: string };
  url?: string;
}

export function course(o: CourseInput): Json {
  return clean({
    "@context": "https://schema.org",
    "@type": "Course",
    name: o.name,
    description: o.description,
    url: o.url,
    provider: clean({ "@type": "Organization", name: o.provider.name, sameAs: o.provider.url }),
  });
}

export interface RecipeInput {
  name: string;
  description?: string;
  image?: string | string[];
  author?: string;
  prepTime?: string;
  cookTime?: string;
  recipeYield?: string;
  ingredients: string[];
  instructions: string[];
}

export function recipe(o: RecipeInput): Json {
  return clean({
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: o.name,
    description: o.description,
    image: o.image,
    author: o.author ? { "@type": "Person", name: o.author } : undefined,
    prepTime: o.prepTime,
    cookTime: o.cookTime,
    recipeYield: o.recipeYield,
    recipeIngredient: o.ingredients,
    recipeInstructions: o.instructions.map((text) => ({ "@type": "HowToStep", text })),
  });
}

/**
 * Build the `alternates.languages` map for a Next.js `Metadata` object.
 * @example { alternates: hreflang({ en: "/en", ne: "/ne" }) }
 */
export function hreflang(map: Record<string, string>): { languages: Record<string, string> } {
  return { languages: map };
}

/** A BlogPosting (Article subtype) — same input as {@link article}. */
export function blogPosting(o: ArticleInput): Json {
  return { ...article(o), "@type": "BlogPosting" };
}

/** A NewsArticle (Article subtype) — same input as {@link article}. */
export function newsArticle(o: ArticleInput): Json {
  return { ...article(o), "@type": "NewsArticle" };
}

export interface WebPageInput {
  name: string;
  description?: string;
  url?: string;
  image?: string;
  datePublished?: string;
  dateModified?: string;
}

export function webPage(o: WebPageInput): Json {
  return clean({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: o.name,
    description: o.description,
    url: o.url,
    image: o.image,
    datePublished: o.datePublished,
    dateModified: o.dateModified,
  });
}

/**
 * Compose several builder outputs into ONE `@graph` document with a shared
 * `@context` (avoids repeating `@context` per node). Feed the result to
 * {@link jsonLdScript}.
 * @example graph(organization(...), website(...), breadcrumb(...))
 */
export function graph(...nodes: Json[]): Json {
  return {
    "@context": "https://schema.org",
    "@graph": nodes.map((n) => {
      const copy = { ...n };
      delete copy["@context"];
      return copy;
    }),
  };
}

function titleize(segment: string): string {
  return decodeURIComponent(segment)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Build a BreadcrumbList from a URL path — no manual item wiring.
 * @example breadcrumbFromPath("/blog/my-post", { baseUrl: "https://x.com" })
 */
export function breadcrumbFromPath(
  path: string,
  opts: { baseUrl: string; labels?: Record<string, string>; homeLabel?: string },
): Json {
  const base = opts.baseUrl.replace(/\/$/, "");
  const segments = path.split(/[?#]/)[0]!.split("/").filter(Boolean);
  const items: { name: string; url: string }[] = [{ name: opts.homeLabel ?? "Home", url: base }];
  let acc = "";
  for (const seg of segments) {
    acc += `/${seg}`;
    items.push({ name: opts.labels?.[seg] ?? titleize(seg), url: base + acc });
  }
  return breadcrumb(items);
}

/* ------------------------------------------------------------------ *
 * Rendering helpers
 * ------------------------------------------------------------------ */

/** Stringify a JSON-LD object (or several) safely for embedding in HTML. */
export function jsonLd(data: Json | Json[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** A complete `<script type="application/ld+json">…</script>` string. */
export function jsonLdScript(data: Json | Json[]): string {
  return `<script type="application/ld+json">${jsonLd(data)}</script>`;
}
