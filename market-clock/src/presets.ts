/**
 * Built-in exchange presets.
 *
 * Ready-made `ExchangeSpec`s for common exchanges. No-DST exchanges (IST/JST/
 * HKT/SGT) use an exact fixed `offsetMinutes`; DST exchanges (US/UK) use an IANA
 * `timeZone` so open/close stay correct across daylight-saving transitions.
 *
 * Bundled holiday lists are hand-maintained and cover 2025–2026 nationally-fixed
 * observances only — verify and extend from the official exchange circular:
 *   `new MarketClock({ ...NYSE, holidays: [...NYSE.holidays, "2027-..."] })`.
 *
 * Lunch breaks (TSE, HKEX) are NOT modelled — the single regular window spans
 * the whole trading day. Use a custom spec if intraday breaks matter to you.
 */

import type { ExchangeSpec } from "./index";

/* ------------------------------------------------------------------ US ---- */

const US_HOLIDAYS: string[] = [
  // 2025
  "2025-01-01", "2025-01-20", "2025-02-17", "2025-04-18", "2025-05-26",
  "2025-06-19", "2025-07-04", "2025-09-01", "2025-11-27", "2025-12-25",
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
  "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
];

/** Early 13:00 closes (day-after-Thanksgiving, Christmas Eve). */
const US_HALF_DAYS: Record<string, { close: string }> = {
  "2025-11-28": { close: "13:00" },
  "2025-12-24": { close: "13:00" },
  "2026-11-27": { close: "13:00" },
  "2026-12-24": { close: "13:00" },
};

/** New York Stock Exchange. Pre-market 04:00, regular 09:30–16:00, after 16:00–20:00 ET. */
export const NYSE: ExchangeSpec = {
  name: "NYSE",
  timeZone: "America/New_York",
  offsetMinutes: -300, // EST fallback; timeZone (DST) takes precedence
  preOpen: { open: "04:00", close: "09:30" },
  regular: { open: "09:30", close: "16:00" },
  postClose: { open: "16:00", close: "20:00" },
  weekend: [0, 6],
  holidays: US_HOLIDAYS,
  halfDays: US_HALF_DAYS,
};

/** NASDAQ — same sessions and calendar as NYSE. */
export const NASDAQ: ExchangeSpec = {
  ...NYSE,
  name: "NASDAQ",
};

/* ------------------------------------------------------------------ UK ---- */

const LSE_HOLIDAYS: string[] = [
  // 2025
  "2025-01-01", "2025-04-18", "2025-04-21", "2025-05-05", "2025-05-26",
  "2025-08-25", "2025-12-25", "2025-12-26",
  // 2026
  "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25",
  "2026-08-31", "2026-12-25", "2026-12-28",
];

/** Early 12:30 closes (Christmas Eve, New Year's Eve). */
const LSE_HALF_DAYS: Record<string, { close: string }> = {
  "2025-12-24": { close: "12:30" },
  "2025-12-31": { close: "12:30" },
  "2026-12-24": { close: "12:30" },
  "2026-12-31": { close: "12:30" },
};

/** London Stock Exchange. Opening auction 07:50, regular 08:00–16:30 London time. */
export const LSE: ExchangeSpec = {
  name: "LSE",
  timeZone: "Europe/London",
  offsetMinutes: 0, // GMT fallback; timeZone (BST) takes precedence
  preOpen: { open: "07:50", close: "08:00" },
  regular: { open: "08:00", close: "16:30" },
  weekend: [0, 6],
  holidays: LSE_HOLIDAYS,
  halfDays: LSE_HALF_DAYS,
};

/* -------------------------------------------------------------- Asia ---- */

const TSE_HOLIDAYS: string[] = [
  // 2025
  "2025-01-01", "2025-01-02", "2025-01-03", "2025-01-13", "2025-02-11",
  "2025-02-24", "2025-05-05", "2025-05-06", "2025-07-21", "2025-08-11",
  "2025-09-15", "2025-09-23", "2025-10-13", "2025-11-03", "2025-11-24",
  "2025-12-31",
  // 2026
  "2026-01-01", "2026-01-02", "2026-01-12", "2026-02-11", "2026-02-23",
  "2026-05-04", "2026-05-05", "2026-05-06", "2026-09-21", "2026-11-03",
  "2026-11-23", "2026-12-31",
];

/**
 * Tokyo Stock Exchange (JST, no DST — exact offset). Regular 09:00–15:00.
 * Note: the 11:30–12:30 lunch break is NOT modelled.
 */
export const TSE: ExchangeSpec = {
  name: "TSE",
  offsetMinutes: 540,
  preOpen: { open: "08:00", close: "09:00" },
  regular: { open: "09:00", close: "15:00" },
  weekend: [0, 6],
  holidays: TSE_HOLIDAYS,
};

const HKEX_HOLIDAYS: string[] = [
  // 2025
  "2025-01-01", "2025-01-29", "2025-01-30", "2025-01-31", "2025-04-04",
  "2025-04-18", "2025-04-21", "2025-05-01", "2025-05-05", "2025-07-01",
  "2025-10-01", "2025-10-07", "2025-10-29", "2025-12-25", "2025-12-26",
  // 2026
  "2026-01-01", "2026-02-17", "2026-02-18", "2026-02-19", "2026-04-03",
  "2026-04-06", "2026-05-01", "2026-05-25", "2026-07-01", "2026-10-01",
  "2026-12-25",
];

/**
 * Hong Kong Exchange (HKT, no DST — exact offset). Regular 09:30–16:00.
 * Note: the 12:00–13:00 lunch break is NOT modelled.
 */
export const HKEX: ExchangeSpec = {
  name: "HKEX",
  offsetMinutes: 480,
  preOpen: { open: "09:00", close: "09:30" },
  regular: { open: "09:30", close: "16:00" },
  weekend: [0, 6],
  holidays: HKEX_HOLIDAYS,
};

const SGX_HOLIDAYS: string[] = [
  // 2025
  "2025-01-01", "2025-01-29", "2025-01-30", "2025-03-31", "2025-04-18",
  "2025-05-01", "2025-05-12", "2025-06-07", "2025-08-09", "2025-10-20",
  "2025-12-25",
  // 2026
  "2026-01-01", "2026-02-17", "2026-02-18", "2026-03-21", "2026-04-03",
  "2026-05-01", "2026-05-27", "2026-05-31", "2026-08-10", "2026-11-08",
  "2026-12-25",
];

/** Singapore Exchange (SGT, no DST — exact offset). Pre-open 08:30, regular 09:00–17:00. */
export const SGX: ExchangeSpec = {
  name: "SGX",
  offsetMinutes: 480,
  preOpen: { open: "08:30", close: "09:00" },
  regular: { open: "09:00", close: "17:00" },
  weekend: [0, 6],
  holidays: SGX_HOLIDAYS,
};
