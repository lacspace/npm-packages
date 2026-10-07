/** What kind of public issue this is. */
export type IssueType = "ipo" | "mutual_fund";

/** Who may apply: everyone, project-affected locals, or Nepalis in foreign employment. */
export type Eligibility = "general" | "locals" | "foreign_employment";

/** One public issue, normalised. All dates are real instants (UTC inside a Date). */
export interface Issue {
  symbol: string;
  companyName: string;
  type: IssueType;
  eligibility: Eligibility;
  sector?: string;
  issueManager?: string;
  rating?: string;
  units?: number;
  minUnits?: number;
  maxUnits?: number;
  pricePerUnit?: number;
  openDate: Date;
  closeDate: Date;
  extendedCloseDate?: Date;
  status?: string;
}

/** The latest entry on the SEBON IPO pipeline page. */
export interface SebonPipelineEntry {
  title: string;
  /** YYYY-MM-DD as printed by SEBON (AD calendar). */
  date: string;
  /** Absolute URL of the English PDF. */
  url: string;
}

/** Anything that can be read as a point in time. */
export type DateLike = Date | string | number;
