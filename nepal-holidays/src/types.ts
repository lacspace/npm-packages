export type Kind = "public-holiday" | "observance";
export type Category = "festival" | "jatra" | "day" | "jayanti";
/**
 * Who gets the day off:
 * - national: everyone
 * - regional: listed districts or an area
 * - community: a community or religion
 * - women: women employees
 * - education: educational institutions
 * - disability: employees with disabilities
 */
export type Scope = "national" | "regional" | "community" | "women" | "education" | "disability";
export type Region = "kathmandu-valley" | "hill" | "terai";
export interface Text { en: string; ne: string }

/** @internal transcription row */
export interface RawEntry {
  id: string;
  sec: string;
  ne: string;
  en: string;
  bs: [number, number] | null;
  wd?: number;
  to?: [number, number];
  toWd?: number;
  kind: Kind;
  cat: Category;
  scope: Scope;
  region?: Region;
  districts?: string[];
  community?: Text;
}

export interface Holiday {
  id: string;
  name: Text;
  kind: Kind;
  category: Category;
  scope: Scope;
  /** Area for a regional holiday. */
  region?: Region;
  /** Districts for a regional holiday (English names). */
  districts?: string[];
  /** Community or religion for a community holiday. */
  community?: Text;
  /** "2083-06-31". null when the notice leaves the date to the day itself (Eid, Bhoto Jatra…). */
  dateBS: string | null;
  /** "2026-10-17" */
  dateAD: string | null;
  /** Last day of a multi-day holiday (Dashain, Tihar). */
  endBS?: string;
  endAD?: string;
  /** Number of days off (1 for single days, 0 when undated). */
  days: number;
  /** Section of the notice, e.g. "2.1(च)". */
  section: string;
  source: Source;
}

export interface Source {
  id: string;
  issuer: Text;
  gazette: string;
  publishedBS: string;
  url: string;
}
