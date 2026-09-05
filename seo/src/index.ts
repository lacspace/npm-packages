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
  /**
   * Fine-grained robots directives → `Metadata.robots`. `noindex: true` still
   * forces `{ index:false, follow:false }` and takes precedence over this.
   */
  robots?: { index?: boolean; follow?: boolean };
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
  if (input.robots) meta.robots = { index: input.robots.index ?? true, follow: input.robots.follow ?? true };
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

/* ------------------------------------------------------------------ *
 * Listing & page-shape builders (ItemList, CollectionPage, QAPage,
 * ImageObject, SoftwareSourceCode, ProfilePage)
 * ------------------------------------------------------------------ */

export interface ItemListEntry {
  name: string;
  url: string;
  image?: string;
  /** Override the 1-based position (defaults to array order). */
  position?: number;
}

export interface ItemListInput {
  /** Name of the list itself (e.g. "Latest posts"). */
  name?: string;
  /** URL of the listing page. */
  url?: string;
  description?: string;
}

/**
 * An ItemList — perfect for listing / index pages (a blog index, a product
 * grid, "related articles"). Each entry becomes a positioned ListItem.
 * @example itemList([{ name: "Post A", url: "/a" }, { name: "Post B", url: "/b" }])
 */
export function itemList(items: ItemListEntry[], opts: ItemListInput = {}): Json {
  return clean({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: opts.name,
    url: opts.url,
    description: opts.description,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) =>
      clean({
        "@type": "ListItem",
        position: it.position ?? i + 1,
        name: it.name,
        url: it.url,
        image: it.image,
      }),
    ),
  });
}

export interface CollectionPageInput {
  name: string;
  url: string;
  description?: string;
  /** Optional entries — embedded as a `hasPart` ItemList. */
  items?: ItemListEntry[];
}

/**
 * A CollectionPage (a category / archive / index page). When `items` are given
 * they are embedded as a `hasPart` ItemList.
 */
export function collectionPage(o: CollectionPageInput): Json {
  const node: Json = clean({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: o.name,
    url: o.url,
    description: o.description,
  });
  if (o.items && o.items.length) {
    const list = { ...itemList(o.items, { name: o.name, url: o.url }) };
    delete list["@context"];
    node.hasPart = list;
  }
  return node;
}

export interface QAItem {
  question: string;
  acceptedAnswer: string;
  /** Alternative community answers, if any. */
  suggestedAnswers?: string[];
}

/**
 * A QAPage — a question-and-answer page (one accepted answer, optional
 * suggested answers per question). Distinct from {@link faqPage}.
 */
export function qaPage(items: QAItem[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "QAPage",
    mainEntity: items.map((it) =>
      clean({
        "@type": "Question",
        name: it.question,
        acceptedAnswer: { "@type": "Answer", text: it.acceptedAnswer },
        suggestedAnswer: it.suggestedAnswers?.map((t) => ({ "@type": "Answer", text: t })),
      }),
    ),
  };
}

export interface ImageObjectInput {
  url: string;
  width?: number;
  height?: number;
  caption?: string;
}

/** An ImageObject — a standalone image with optional dimensions & caption. */
export function imageObject(o: ImageObjectInput): Json {
  return clean({
    "@context": "https://schema.org",
    "@type": "ImageObject",
    url: o.url,
    contentUrl: o.url,
    width: o.width,
    height: o.height,
    caption: o.caption,
  });
}

export interface SoftwareSourceCodeInput {
  name: string;
  /** URL of the source repository (e.g. GitHub). */
  codeRepository: string;
  /** e.g. "TypeScript". */
  programmingLanguage: string;
  license?: string;
  /** e.g. "Node.js", "Browser", "Edge". */
  runtimePlatform?: string;
  description?: string;
  url?: string;
}

/**
 * A SoftwareSourceCode node — for open-source package / library pages.
 * @example softwareSourceCode({ name: "@lacspace/seo", codeRepository: "https://github.com/lacspace/npm-packages", programmingLanguage: "TypeScript" })
 */
export function softwareSourceCode(o: SoftwareSourceCodeInput): Json {
  return clean({
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    name: o.name,
    codeRepository: o.codeRepository,
    programmingLanguage: o.programmingLanguage,
    license: o.license,
    runtimePlatform: o.runtimePlatform,
    description: o.description,
    url: o.url,
  });
}

export interface ProfilePageInput {
  /** The person (or profile subject) this page is about. */
  person: PersonInput;
  url?: string;
  dateCreated?: string;
  dateModified?: string;
}

/** A ProfilePage — a page about a single person, wrapping a Person as `mainEntity`. */
export function profilePage(o: ProfilePageInput): Json {
  const subject = { ...person(o.person) };
  delete subject["@context"];
  return clean({
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: o.url,
    dateCreated: o.dateCreated,
    dateModified: o.dateModified,
    mainEntity: subject,
  });
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
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // Malformed percent-encoding — fall back to the raw segment instead of throwing.
    decoded = segment;
  }
  return decoded
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

/* ================================================================== *
 * SEO Auditor — fetch a page's HTML, grade its on-page SEO.
 *
 * auditHtml() is isomorphic & dependency-free: give it the HTML string
 * (from fetch, a build step, or a test) and get a scored report.
 * The `@lacspace/seo audit <url>` CLI wraps it with a fetcher.
 * ================================================================== */

export type CheckStatus = "pass" | "warn" | "fail";

export interface SeoCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  /** Weight in the score (critical checks count double). */
  weight: number;
}

export interface SeoAudit {
  url?: string;
  /** 0–100. */
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  checks: SeoCheck[];
  passed: number;
  warnings: number;
  failed: number;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

function tagByAttr(html: string, tag: string, attr: string, value: string): string | undefined {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}=["']${value}["'][^>]*>`, "i");
  return html.match(re)?.[0];
}

function attrValue(tag: string, attr: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${attr}=["']([\\s\\S]*?)["']`, "i"));
  return m?.[1];
}

function metaContent(html: string, key: string): string | undefined {
  const tag = tagByAttr(html, "meta", "name", key) ?? tagByAttr(html, "meta", "property", key);
  if (!tag) return undefined;
  const content = attrValue(tag, "content");
  return content ? decodeEntities(content).trim() : undefined;
}

const GRADE = (score: number): SeoAudit["grade"] =>
  score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";

/**
 * Grade a page's on-page SEO from its raw HTML — title, meta description,
 * canonical, headings, Open Graph, Twitter, viewport, lang, charset, JSON-LD,
 * image alts and indexability. Returns a 0–100 score, a letter grade and every
 * check with a human explanation. Dependency-free & isomorphic.
 */
export function auditHtml(html: string, opts: { url?: string } = {}): SeoAudit {
  const checks: SeoCheck[] = [];
  const add = (id: string, label: string, status: CheckStatus, detail: string, weight = 1): void => {
    checks.push({ id, label, status, detail, weight });
  };

  // <title>
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  const titleText = title ? decodeEntities(title) : "";
  if (!titleText) add("title", "Title tag", "fail", "No <title> found.", 2);
  else if (titleText.length < 10) add("title", "Title tag", "warn", `Only ${titleText.length} chars — aim for 10–60.`, 2);
  else if (titleText.length > 60) add("title", "Title tag", "warn", `${titleText.length} chars — may truncate in search (aim ≤60).`, 2);
  else add("title", "Title tag", "pass", `"${titleText}" (${titleText.length} chars).`, 2);

  // meta description
  const desc = metaContent(html, "description");
  if (!desc) add("description", "Meta description", "fail", "No meta description.", 2);
  else if (desc.length < 50) add("description", "Meta description", "warn", `Only ${desc.length} chars — aim for 50–160.`, 2);
  else if (desc.length > 160) add("description", "Meta description", "warn", `${desc.length} chars — will truncate (aim ≤160).`, 2);
  else add("description", "Meta description", "pass", `${desc.length} chars.`, 2);

  // canonical
  const canonical = tagByAttr(html, "link", "rel", "canonical");
  if (canonical) add("canonical", "Canonical URL", "pass", attrValue(canonical, "href") ?? "present", 2);
  else add("canonical", "Canonical URL", "fail", "No <link rel=\"canonical\">.", 2);

  // exactly one h1
  const h1s = html.match(/<h1[\s>]/gi)?.length ?? 0;
  if (h1s === 1) add("h1", "Single H1", "pass", "Exactly one <h1>.", 1);
  else if (h1s === 0) add("h1", "Single H1", "fail", "No <h1> on the page.", 1);
  else add("h1", "Single H1", "warn", `${h1s} <h1> tags — prefer exactly one.`, 1);

  // Open Graph
  const ogTitle = metaContent(html, "og:title");
  const ogDesc = metaContent(html, "og:description");
  const ogImage = metaContent(html, "og:image");
  const ogMissing = [!ogTitle && "og:title", !ogDesc && "og:description", !ogImage && "og:image"].filter(Boolean);
  if (ogMissing.length === 0) add("og", "Open Graph", "pass", "og:title, og:description & og:image present.", 2);
  else if (ogImage) add("og", "Open Graph", "warn", `Missing ${ogMissing.join(", ")}.`, 2);
  else add("og", "Open Graph", "fail", `Missing ${ogMissing.join(", ")} — no social preview.`, 2);

  // Twitter card
  const twCard = metaContent(html, "twitter:card");
  if (twCard) add("twitter", "Twitter card", "pass", `card = ${twCard}.`, 1);
  else add("twitter", "Twitter card", "warn", "No twitter:card — falls back to og.", 1);

  // viewport
  if (metaContent(html, "viewport")) add("viewport", "Mobile viewport", "pass", "viewport meta present.", 1);
  else add("viewport", "Mobile viewport", "fail", "No viewport meta — not mobile-friendly.", 1);

  // lang
  const htmlTag = html.match(/<html\b[^>]*>/i)?.[0];
  const lang = htmlTag ? attrValue(htmlTag, "lang") : undefined;
  if (lang) add("lang", "HTML lang", "pass", `lang = ${lang}.`, 1);
  else add("lang", "HTML lang", "warn", "No lang attribute on <html>.", 1);

  // charset
  if (/<meta[^>]*\bcharset=/i.test(html)) add("charset", "Charset", "pass", "charset declared.", 1);
  else add("charset", "Charset", "warn", "No <meta charset>.", 1);

  // JSON-LD
  const ldBlocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  if (ldBlocks.length === 0) {
    add("jsonld", "Structured data", "warn", "No JSON-LD — you miss rich results.", 1);
  } else {
    let bad = 0;
    for (const b of ldBlocks) {
      const body = b.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
      try { JSON.parse(body); } catch { bad++; }
    }
    if (bad === 0) add("jsonld", "Structured data", "pass", `${ldBlocks.length} valid JSON-LD block(s).`, 1);
    else add("jsonld", "Structured data", "fail", `${bad}/${ldBlocks.length} JSON-LD block(s) are invalid JSON.`, 1);
  }

  // images missing alt
  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  const noAlt = imgs.filter((t) => !/\balt=/i.test(t)).length;
  if (imgs.length === 0) add("imgalt", "Image alt text", "pass", "No <img> tags.", 1);
  else if (noAlt === 0) add("imgalt", "Image alt text", "pass", `All ${imgs.length} images have alt.`, 1);
  else add("imgalt", "Image alt text", "warn", `${noAlt}/${imgs.length} images missing alt.`, 1);

  // indexability
  const robotsMeta = metaContent(html, "robots");
  if (robotsMeta && /noindex/i.test(robotsMeta)) add("index", "Indexable", "fail", "robots meta says noindex — hidden from search.", 2);
  else add("index", "Indexable", "pass", robotsMeta ? `robots = ${robotsMeta}.` : "No noindex.", 2);

  // score
  let got = 0;
  let max = 0;
  for (const c of checks) {
    max += c.weight;
    got += c.weight * (c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0);
  }
  const score = max > 0 ? Math.round((got / max) * 100) : 0;

  return {
    url: opts.url,
    score,
    grade: GRADE(score),
    checks,
    passed: checks.filter((c) => c.status === "pass").length,
    warnings: checks.filter((c) => c.status === "warn").length,
    failed: checks.filter((c) => c.status === "fail").length,
  };
}

/* ================================================================== *
 * Content auto-derivation — turn raw content into SEO text for free.
 * ================================================================== */

/** Strip Markdown / HTML down to clean prose (for excerpts & descriptions). */
export function stripMarkdown(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, " ")          // fenced code
    .replace(/`[^`]*`/g, " ")                  // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")     // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")   // links → text
    .replace(/<\/?[^>]+>/g, " ")               // html tags
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")        // headings
    .replace(/^\s{0,3}>\s?/gm, "")             // blockquotes
    .replace(/[*_~]{1,3}/g, "")                // emphasis marks
    .replace(/^\s*[-*+]\s+/gm, "")             // list bullets
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A clean, length-capped excerpt for `<meta description>` / OG — cuts on a
 * word boundary and adds an ellipsis. Handles Markdown/HTML input.
 * @example excerpt(post.body) // "The first ~155 characters, tidied…"
 */
export function excerpt(input: string, maxLength = 155): string {
  const text = stripMarkdown(input);
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxLength * 0.5 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?-]+$/, "")}…`;
}

/** Alias of {@link excerpt} tuned for meta descriptions (default 155 chars). */
export const metaDescription = excerpt;

export interface ReadingTime {
  minutes: number;
  words: number;
  /** Human label, e.g. "5 min read". */
  text: string;
}

/** Estimate reading time from content (default 200 wpm). Great for article schema & UI. */
export function readingTime(input: string, wordsPerMinute = 200): ReadingTime {
  const words = stripMarkdown(input).split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / wordsPerMinute));
  return { minutes, words, text: `${minutes} min read` };
}

/**
 * Build a dynamic OG-image URL for a "/og" style endpoint — encodes params
 * into the query string. Pairs with a Next.js ImageResponse route.
 * @example ogImageUrl("https://x.com/og", { title: "Hello", theme: "dark" })
 */
export function ogImageUrl(endpoint: string, params: Record<string, string | number | undefined>): string {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return qs ? `${endpoint}${endpoint.includes("?") ? "&" : "?"}${qs}` : endpoint;
}

/* ================================================================== *
 * SEO Autopilot — configure your site ONCE, auto-fill every page.
 *
 * defineSite() captures your brand defaults (name, url, logo, social,
 * default image, title template) so page code stays a one-liner:
 *   const site = defineSite({ name: "Acme", url: "https://acme.com", … });
 *   export const metadata = site.meta({ title: "Pricing", path: "/pricing" });
 * ================================================================== */

export interface SiteConfig {
  /** Brand / site name — used in titles, OG siteName, Organization & WebSite. */
  name: string;
  /** Absolute base URL, e.g. "https://acme.com" (trailing slash optional). */
  url: string;
  /** Default meta description when a page omits one. */
  description?: string;
  /** Logo URL (absolute or root-relative). */
  logo?: string;
  /** Default social-share image (absolute or root-relative). */
  defaultImage?: string;
  /** Title template; "%s" → the page title. Default `"%s · <name>"`. */
  titleTemplate?: string;
  /** Locale, e.g. "en_US". */
  locale?: string;
  /** Twitter/X handle for the site (with or without "@"). */
  twitter?: string;
  /** Social / profile URLs → Organization.sameAs. */
  sameAs?: string[];
  /** Sitelinks search box template, "https://x.com/search?q={search_term_string}". */
  searchUrl?: string;
  /** Organization contact. */
  email?: string;
  telephone?: string;
  /** Keywords merged into every page. */
  keywords?: string[];
  /**
   * Dynamic OG-image endpoint (e.g. "/og"). When set, pages without an explicit
   * image get `<endpoint>?title=<page title>` — auto social cards, zero design work.
   */
  ogImage?: string;
}

export interface SitePageInput {
  title: string;
  description?: string;
  /** Path like "/pricing" (preferred) or an absolute URL. */
  path?: string;
  image?: string;
  keywords?: string[];
  type?: "website" | "article" | "profile";
  noindex?: boolean;
  /** Fine-grained robots directives → `Metadata.robots` (`noindex` wins). */
  robots?: { index?: boolean; follow?: boolean };
  /** i18n alternates (locale → absolute url) → `alternates.languages`. */
  languages?: Record<string, string>;
  /** If no `description` is given, one is auto-derived from this content. */
  content?: string;
  article?: SeoInput["article"];
}

export interface SiteArticleInput extends Omit<SitePageInput, "type"> {
  datePublished: string;
  dateModified?: string;
  author?: string;
  section?: string;
  tags?: string[];
}

export interface SiteProductInput extends Omit<SitePageInput, "type"> {
  price?: number | string;
  currency?: string;
  availability?: "InStock" | "OutOfStock" | "PreOrder";
  brand?: string;
  sku?: string;
  rating?: { value: number; count: number };
}

/** A page's SEO in one object — spread `metadata`, render `jsonLd`. */
export interface SitePage {
  metadata: Metadata;
  jsonLd: Json;
}

export interface Site {
  readonly config: Readonly<SiteConfig>;
  /** Absolute URL for a path (or the base URL when omitted). */
  url(path?: string): string;
  /** Full Next.js Metadata for a page, with all brand defaults applied. */
  meta(input: SitePageInput): Metadata;
  /** Organization JSON-LD, prefilled from the config. */
  organization(): Json;
  /** WebSite JSON-LD (with SearchAction when `searchUrl` is set). */
  website(): Json;
  /** BreadcrumbList JSON-LD derived from a path. */
  breadcrumb(path: string, labels?: Record<string, string>): Json;
  /** Generic page: `{ metadata, jsonLd:@graph(WebPage, Breadcrumb) }`. */
  page(input: SitePageInput): SitePage;
  /** Article/blog page: metadata + `@graph(BlogPosting, Breadcrumb)`. */
  article(input: SiteArticleInput): SitePage;
  /** Product page: metadata + `@graph(Product, Breadcrumb)`. */
  product(input: SiteProductInput): SitePage;
  /** FAQ page: metadata + `@graph(FAQPage, Breadcrumb)`. */
  faq(items: { question: string; answer: string }[], input: SitePageInput): SitePage;
  /** Listing/index page: metadata + `@graph(CollectionPage, ItemList, Breadcrumb)`. */
  collection(input: SiteCollectionInput): SitePage;
  /** App/tool page: metadata + `@graph(SoftwareApplication, Breadcrumb)`. */
  softwareApp(input: SiteSoftwareInput): SitePage;
  /** Event page: metadata + `@graph(Event, Breadcrumb)`. */
  event(input: SiteEventInput): SitePage;
  /** Local business / store page: metadata + `@graph(LocalBusiness, Breadcrumb)`. */
  localBusiness(input: SiteLocalBusinessInput): SitePage;
  /** Organization + WebSite as one `@graph` — drop into your root layout once. */
  rootJsonLd(): Json;
}

export interface SiteSoftwareInput extends SitePageInput {
  operatingSystem?: string;
  category?: string;
  price?: number | string;
  currency?: string;
}

export interface SiteEventInput extends Omit<SitePageInput, "type"> {
  startDate: string;
  endDate?: string;
  location?: { name?: string; address?: PostalAddress; url?: string };
  online?: boolean;
  price?: number | string;
  currency?: string;
}

export interface SiteCollectionInput extends SitePageInput {
  /** Entries in the list (URLs may be paths — resolved against the base URL). */
  items: { name: string; url: string; image?: string }[];
}

export interface SiteLocalBusinessInput extends Omit<SitePageInput, "type"> {
  telephone?: string;
  priceRange?: string;
  address?: PostalAddress;
  geo?: { latitude: number; longitude: number };
  openingHours?: string[];
  rating?: { value: number; count: number };
}

const normHandle = (h?: string): string | undefined => (h ? (h.startsWith("@") ? h : `@${h}`) : undefined);

const mergeKeywords = (a?: string[], b?: string[]): string[] | undefined => {
  if (!a && !b) return undefined;
  return [...new Set([...(a ?? []), ...(b ?? [])])];
};

/**
 * Create a configured {@link Site}. Set your brand once; every page becomes a
 * one-liner with canonical URL, title template, Open Graph, Twitter card,
 * auto description and auto OG image all filled in.
 */
export function defineSite(config: SiteConfig): Site {
  const base = config.url.replace(/\/$/, "");
  const template = config.titleTemplate ?? `%s · ${config.name}`;
  const handle = normHandle(config.twitter);

  const abs = (path?: string): string => {
    if (!path) return base;
    if (/^https?:\/\//.test(path)) return path;
    return `${base}/${path.replace(/^\//, "")}`;
  };
  const applyTitle = (t: string): string => (t === config.name ? t : template.replace("%s", t));
  const pickImage = (image: string | undefined, title: string): string | undefined => {
    if (image) return abs(image);
    if (config.ogImage) return ogImageUrl(abs(config.ogImage), { title });
    return config.defaultImage ? abs(config.defaultImage) : undefined;
  };
  const describe = (input: SitePageInput): string | undefined =>
    input.description ?? (input.content ? excerpt(input.content) : config.description);

  const site: Site = {
    config,
    url: abs,
    meta(input) {
      return seoMetadata({
        title: applyTitle(input.title),
        description: describe(input),
        canonical: input.path ? abs(input.path) : undefined,
        baseUrl: base,
        image: pickImage(input.image, input.title),
        siteName: config.name,
        type: input.type,
        locale: config.locale,
        twitterSite: handle,
        twitterCreator: handle,
        noindex: input.noindex,
        robots: input.robots,
        keywords: mergeKeywords(config.keywords, input.keywords),
        languages: input.languages,
        article: input.article,
      });
    },
    organization: () =>
      organization({
        name: config.name,
        url: base,
        logo: config.logo ? abs(config.logo) : undefined,
        description: config.description,
        sameAs: config.sameAs,
        email: config.email,
        telephone: config.telephone,
      }),
    website: () => website({ name: config.name, url: base, searchUrl: config.searchUrl }),
    breadcrumb: (path, labels) => breadcrumbFromPath(path, { baseUrl: base, labels }),
    rootJsonLd: () => graph(site.organization(), site.website()),
    page(input) {
      const metadata = site.meta(input);
      const jsonLd = graph(
        webPage({ name: input.title, url: abs(input.path), description: metadata.description }),
        site.breadcrumb(input.path ?? "/"),
      );
      return { metadata, jsonLd };
    },
    article(input) {
      const metadata = site.meta({ ...input, type: "article" });
      const publisher: OrganizationInput | undefined = config.logo
        ? { name: config.name, url: base, logo: abs(config.logo) }
        : { name: config.name, url: base };
      const jsonLd = graph(
        blogPosting({
          headline: input.title,
          description: metadata.description,
          image: pickImage(input.image, input.title),
          author: input.author ?? config.name,
          datePublished: input.datePublished,
          dateModified: input.dateModified,
          url: abs(input.path),
          publisher,
        }),
        site.breadcrumb(input.path ?? "/"),
      );
      return { metadata, jsonLd };
    },
    product(input) {
      const metadata = site.meta(input);
      const jsonLd = graph(
        product({
          name: input.title,
          description: metadata.description,
          image: pickImage(input.image, input.title),
          brand: input.brand ?? config.name,
          sku: input.sku,
          offers:
            input.price !== undefined
              ? { price: input.price, currency: input.currency ?? "USD", availability: input.availability, url: abs(input.path) }
              : undefined,
          rating: input.rating,
        }),
        site.breadcrumb(input.path ?? "/"),
      );
      return { metadata, jsonLd };
    },
    faq(items, input) {
      const metadata = site.meta(input);
      const jsonLd = graph(
        faqPage(items),
        site.breadcrumb(input.path ?? "/"),
      );
      return { metadata, jsonLd };
    },
    collection(input) {
      const metadata = site.meta(input);
      const listUrl = abs(input.path);
      const items = input.items.map((it) => ({ ...it, url: abs(it.url) }));
      const jsonLd = graph(
        collectionPage({ name: input.title, url: listUrl, description: metadata.description }),
        itemList(items, { name: input.title, url: listUrl }),
        site.breadcrumb(input.path ?? "/"),
      );
      return { metadata, jsonLd };
    },
    softwareApp(input) {
      const metadata = site.meta(input);
      const jsonLd = graph(
        softwareApp({
          name: input.title,
          description: metadata.description,
          operatingSystem: input.operatingSystem,
          category: input.category,
          price: input.price,
          currency: input.currency,
          url: abs(input.path),
        }),
        site.breadcrumb(input.path ?? "/"),
      );
      return { metadata, jsonLd };
    },
    event(input) {
      const metadata = site.meta(input);
      const jsonLd = graph(
        event({
          name: input.title,
          description: metadata.description,
          image: pickImage(input.image, input.title),
          url: abs(input.path),
          startDate: input.startDate,
          endDate: input.endDate,
          location: input.location,
          online: input.online,
          offers: input.price !== undefined ? { price: input.price, currency: input.currency ?? "USD" } : undefined,
        }),
        site.breadcrumb(input.path ?? "/"),
      );
      return { metadata, jsonLd };
    },
    localBusiness(input) {
      const metadata = site.meta(input);
      const jsonLd = graph(
        localBusiness({
          name: input.title,
          url: abs(input.path),
          image: pickImage(input.image, input.title),
          telephone: input.telephone,
          priceRange: input.priceRange,
          address: input.address,
          geo: input.geo,
          openingHours: input.openingHours,
          rating: input.rating,
        }),
        site.breadcrumb(input.path ?? "/"),
      );
      return { metadata, jsonLd };
    },
  };
  return site;
}
