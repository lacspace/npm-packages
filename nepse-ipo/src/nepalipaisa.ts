import { nptDate, parseTime, parseYmd } from "./time";
import type { Eligibility, Issue, IssueType } from "./types";

type Row = Record<string, unknown>;

const OPEN_TIME = "10:00";
const DEFAULT_CLOSE_TIME = "17:00";

function str(v: unknown): string | undefined {
  if (typeof v === "string") {
    const s = v.replace(/\s+/g, " ").trim();
    return s === "" ? undefined : s;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}

/** Numbers or numeric strings ("1,23,000", " 100 "). Undefined otherwise. */
export function toNumber(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v !== "string") return undefined;
  const s = v.replace(/,/g, "").trim();
  if (s === "" || !/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** Map nepalipaisa's shareType to eligibility. Unknown values count as general. */
export function eligibilityOf(shareType: unknown): Eligibility {
  const s = typeof shareType === "string" ? shareType.trim().toLowerCase().replace(/\s+/g, " ") : "";
  if (s === "local" || s === "locals") return "locals";
  if (s === "migrant workers" || s === "migrant worker" || s === "foreign employment") {
    return "foreign_employment";
  }
  return "general";
}

/** Mutual fund when the sector says so or the name contains Fund, Yojana or Scheme. */
export function issueTypeOf(sectorName: unknown, companyName: unknown): IssueType {
  if (typeof sectorName === "string" && /mutual fund/i.test(sectorName)) return "mutual_fund";
  if (typeof companyName === "string" && /\b(fund|yojana|scheme)\b/i.test(companyName)) {
    return "mutual_fund";
  }
  return "ipo";
}

function rowsOf(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== "object") return [];
  const result = (json as Row).result;
  if (result && typeof result === "object") {
    const data = (result as Row).data;
    if (Array.isArray(data)) return data;
  }
  const data = (json as Row).data;
  return Array.isArray(data) ? data : [];
}

function datePart(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return parseYmd(s) ? s.slice(0, 10) : undefined;
}

function toIssue(raw: unknown): { issue: Issue; key: string; ordinary: boolean } | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const row = raw as Row;
  const symbol = str(row.stockSymbol)?.toUpperCase();
  if (!symbol) return undefined;
  const openYmd = datePart(row.openingDateAD);
  const closeYmd = datePart(row.closingDateAD);
  if (!openYmd || !closeYmd) return undefined;

  const rawCloseTime = str(row.closingDateClosingTime);
  const closeTime = rawCloseTime && parseTime(rawCloseTime) ? rawCloseTime : DEFAULT_CLOSE_TIME;
  const openDate = nptDate(openYmd, OPEN_TIME);
  const closeDate = nptDate(closeYmd, closeTime);
  if (!openDate || !closeDate) return undefined;

  const companyName = str(row.companyName) ?? symbol;
  const sector = str(row.sectorName);
  const issue: Issue = {
    symbol,
    companyName,
    type: issueTypeOf(sector, companyName),
    eligibility: eligibilityOf(row.shareType),
    openDate,
    closeDate,
  };
  if (sector) issue.sector = sector;
  const issueManager = str(row.shareRegistrar);
  if (issueManager) issue.issueManager = issueManager;
  const rating = str(row.rating);
  if (rating) issue.rating = rating;
  const units = toNumber(row.units);
  if (units !== undefined) issue.units = units;
  const minUnits = toNumber(row.minUnits);
  if (minUnits !== undefined) issue.minUnits = minUnits;
  const maxUnits = toNumber(row.maxUnits);
  if (maxUnits !== undefined) issue.maxUnits = maxUnits;
  const pricePerUnit = toNumber(row.pricePerUnit);
  if (pricePerUnit !== undefined) issue.pricePerUnit = pricePerUnit;

  const extYmd = datePart(row.extendedDateAD);
  if (extYmd) {
    const ext = nptDate(extYmd, closeTime);
    if (ext && ext.getTime() > closeDate.getTime()) issue.extendedCloseDate = ext;
  }
  const status = str(row.status);
  if (status) issue.status = status;

  return { issue, key: `${symbol}|${openYmd}`, ordinary: isOrdinary(row.shareType) };
}

function isOrdinary(shareType: unknown): boolean {
  return typeof shareType === "string" && shareType.trim().toLowerCase() === "ordinary";
}

/**
 * Parse the JSON of nepalipaisa.com `GET /api/GetIpos`. Rows are read from `result.data`
 * (a bare array also works). Malformed rows are skipped; never throws.
 */
export function parseNepaliPaisaIpos(json: unknown): Issue[] {
  const byKey = new Map<string, { issue: Issue; ordinary: boolean }>();
  for (const raw of rowsOf(json)) {
    let parsed: ReturnType<typeof toIssue>;
    try {
      parsed = toIssue(raw);
    } catch {
      parsed = undefined;
    }
    if (!parsed) continue;
    const existing = byKey.get(parsed.key);
    if (!existing || (!existing.ordinary && parsed.ordinary)) {
      byKey.set(parsed.key, { issue: parsed.issue, ordinary: parsed.ordinary });
    }
  }
  const out = Array.from(byKey.values(), (v) => v.issue);
  out.sort((a, b) => {
    const diff = b.openDate.getTime() - a.openDate.getTime();
    if (diff !== 0) return diff;
    return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;
  });
  return out;
}
