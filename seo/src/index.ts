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
  images?: { url: string }[];
}

export interface TwitterMeta {
  card: "summary" | "summary_large_image";
  title?: string;
  description?: string;
  images?: string[];
}

export interface Metadata {
  title?: string;
  description?: string;
  keywords?: string[];
  alternates?: { canonical?: string };
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
  keywords?: string[];
  siteName?: string;
  type?: "website" | "article" | "profile";
  twitterCard?: "summary" | "summary_large_image";
  noindex?: boolean;
  /** Used to turn a relative `canonical` into an absolute OG url. */
  baseUrl?: string;
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
  const meta: Metadata = {
    title: input.title,
    description: input.description,
    keywords: input.keywords,
    alternates: input.canonical ? { canonical: input.canonical } : undefined,
    openGraph: {
      title: input.title,
      description: input.description,
      url,
      siteName: input.siteName,
      type: input.type ?? "website",
      images: input.image ? [{ url: input.image }] : undefined,
    },
    twitter: {
      card: input.twitterCard ?? (input.image ? "summary_large_image" : "summary"),
      title: input.title,
      description: input.description,
      images: input.image ? [input.image] : undefined,
    },
  };
  if (input.noindex) meta.robots = { index: false, follow: false };
  return meta;
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
