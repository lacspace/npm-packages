export type SourceKind = "exam" | "commission" | "university" | "council" | "transport" | "board";

export interface Source {
  id: string;
  name: string;
  nameNe: string;
  /** The human-facing notice list page. */
  url: string;
  /** Where {@link fetchNotices} actually reads from, when it differs from `url` (a JSON API behind a JS app). */
  feedUrl?: string;
  /** Extra request headers the feed needs. */
  headers?: Record<string, string>;
  kind: SourceKind;
  /** Adapter id used for this source ("generic" = the fallback finder). */
  adapter: string;
}

const NEC_INPUT = encodeURIComponent(JSON.stringify({ json: { page: 1, limit: 20, sortBy: "createdAt", sortOrder: "desc" } }));

/** Nepali government and university notice boards this package knows. */
export const SOURCES: readonly Source[] = [
  {
    id: "psc", name: "Public Service Commission", nameNe: "लोक सेवा आयोग", kind: "commission", adapter: "psc",
    url: "https://psc.gov.np/category/notice",
    feedUrl: "https://psc.gov.np/front/category/notice",
    headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
  },
  {
    id: "psc-results", name: "Public Service Commission: written exam results", nameNe: "लोक सेवा आयोग: लिखित नतिजा", kind: "commission", adapter: "psc",
    url: "https://psc.gov.np/category/result/all",
    feedUrl: "https://psc.gov.np/front/branch-details/all/written_result?page=1&pageNum=20",
    headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
  },
  {
    id: "psc-recommendations", name: "Public Service Commission: recommendations (final results)", nameNe: "लोक सेवा आयोग: सिफारिस", kind: "commission", adapter: "psc",
    url: "https://psc.gov.np/category/recommended/all",
    feedUrl: "https://psc.gov.np/front/branch-details/all/recommendation?page=1&pageNum=20",
    headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
  },
  {
    id: "neb", name: "National Examinations Board", nameNe: "राष्ट्रिय परीक्षा बोर्ड", kind: "exam", adapter: "neb",
    url: "https://neb.gov.np/",
  },
  {
    id: "see", name: "Office of the Controller of Examinations, Sanothimi (SEE)", nameNe: "परीक्षा नियन्त्रण कार्यालय, सानोठिमी", kind: "exam", adapter: "giwms",
    url: "https://see.gov.np/category/notice/",
  },
  {
    id: "see-results", name: "Office of the Controller of Examinations, Sanothimi (SEE): results and publications", nameNe: "परीक्षा नियन्त्रण कार्यालय, सानोठिमी: प्रकाशन", kind: "exam", adapter: "giwms",
    url: "https://see.gov.np/category/publication/",
  },
  {
    id: "tsc", name: "Teacher Service Commission", nameNe: "शिक्षक सेवा आयोग", kind: "commission", adapter: "giwms",
    url: "https://tsc.gov.np/category/72/",
  },
  {
    id: "tsc-results", name: "Teacher Service Commission: results and recommendations", nameNe: "शिक्षक सेवा आयोग: नतिजा", kind: "commission", adapter: "giwms",
    url: "https://tsc.gov.np/category/73/",
  },
  {
    id: "mec", name: "Medical Education Commission", nameNe: "चिकित्सा शिक्षा आयोग", kind: "commission", adapter: "mec",
    url: "https://mec.gov.np/np/category/notice",
  },
  {
    id: "ctevt", name: "Council for Technical Education and Vocational Training", nameNe: "प्राविधिक शिक्षा तथा व्यावसायिक तालिम परिषद्", kind: "council", adapter: "ctevt",
    url: "https://ctevt.org.np/documents/list/notice-board",
  },
  {
    id: "tuexam", name: "Tribhuvan University, Office of the Controller of Examinations", nameNe: "त्रिभुवन विश्वविद्यालय परीक्षा नियन्त्रण कार्यालय", kind: "university", adapter: "generic",
    url: "https://tuexam.edu.np/",
  },
  {
    id: "nec", name: "Nepal Engineering Council", nameNe: "नेपाल इन्जिनियरिङ परिषद्", kind: "council", adapter: "nec",
    url: "https://nec.gov.np/notices",
    feedUrl: `https://nec.gov.np/api/trpc/notice.getNoticesPublic?input=${NEC_INPUT}`,
    headers: { Accept: "application/json" },
  },
  {
    id: "nmc", name: "Nepal Medical Council", nameNe: "नेपाल मेडिकल काउन्सिल", kind: "council", adapter: "generic",
    url: "https://nmc.org.np/latest-notice",
  },
  {
    id: "dotm", name: "Department of Transport Management", nameNe: "यातायात व्यवस्था विभाग", kind: "transport", adapter: "giwms",
    url: "https://dotm.gov.np/category/latest-news/",
  },
];

/** Look a source up by id. */
export function getSource(id: string): Source | undefined {
  return SOURCES.find((s) => s.id === id);
}

/** The registered source whose site is `host`, if any. */
export function sourceForHost(host: string): Source | undefined {
  const h = host.toLowerCase().replace(/^www\./, "");
  return SOURCES.find((s) => new URL(s.url).hostname.replace(/^www\./, "") === h);
}
