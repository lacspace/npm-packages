/**
 * National number rules per country: allowed lengths of the national
 * significant number (after the calling code, without a trunk prefix), the
 * trunk prefix to strip from national input, and, for major markets, a mobile
 * prefix pattern and a display grouping. Lengths follow ITU-T E.164 national
 * numbering plans; a number is "valid" here when its structure is possible,
 * which is what a form can check offline.
 */
export interface Rule {
  /** Allowed lengths of the national significant number. */
  lengths: number[];
  /** Digit(s) dialled before a national number and dropped in E.164 (e.g. "0"). */
  trunk?: string;
  /** Leading digits (after the trunk prefix) that mark a mobile number. */
  mobile?: RegExp;
  /** How to group the national number for display, e.g. [3, 3, 4]. */
  groups?: number[];
  /** Digits that may follow the country code for numbers in this country (shared codes, e.g. NANP area codes). */
  leading?: RegExp;
}

const NANP = { lengths: [10], trunk: "1", groups: [3, 3, 4] };

export const RULES: Record<string, Rule> = {
  // North American Numbering Plan (+1); area codes distinguish the countries.
  US: { ...NANP, leading: /^(2[0-9]{2}|3[0-9]{2}|4[0-9]{2}|5[0-9]{2}|6[0-9]{2}|7[0-9]{2}|8[0-9]{2}|9[0-9]{2})/ },
  CA: { ...NANP, leading: /^(204|226|236|249|250|263|289|306|343|354|365|367|368|382|403|416|418|428|431|437|438|450|468|474|506|514|519|548|579|581|584|587|604|613|639|647|672|683|705|709|742|753|778|780|782|807|819|825|867|873|879|902|905)/ },
  PR: { ...NANP, leading: /^(787|939)/ }, DO: { ...NANP, leading: /^(809|829|849)/ }, JM: { ...NANP, leading: /^(876|658)/ },
  BS: { ...NANP, leading: /^242/ }, BB: { ...NANP, leading: /^246/ }, AI: { ...NANP, leading: /^264/ }, AG: { ...NANP, leading: /^268/ },
  VG: { ...NANP, leading: /^284/ }, VI: { ...NANP, leading: /^340/ }, KY: { ...NANP, leading: /^345/ }, BM: { ...NANP, leading: /^441/ },
  GD: { ...NANP, leading: /^473/ }, TC: { ...NANP, leading: /^649/ }, MS: { ...NANP, leading: /^664/ }, MP: { ...NANP, leading: /^670/ },
  GU: { ...NANP, leading: /^671/ }, AS: { ...NANP, leading: /^684/ }, SX: { ...NANP, leading: /^721/ }, LC: { ...NANP, leading: /^758/ },
  DM: { ...NANP, leading: /^767/ }, VC: { ...NANP, leading: /^784/ }, TT: { ...NANP, leading: /^868/ }, KN: { ...NANP, leading: /^869/ },
  // Asia
  NP: { lengths: [8, 10], trunk: "0", mobile: /^9[678]/, groups: [3, 3, 4] },
  IN: { lengths: [10], trunk: "0", mobile: /^[6-9]/, groups: [5, 5] },
  CN: { lengths: [10, 11], trunk: "0", mobile: /^1[3-9]/, groups: [3, 4, 4] },
  JP: { lengths: [9, 10], trunk: "0", mobile: /^[789]0/, groups: [2, 4, 4] },
  KR: { lengths: [8, 9, 10], trunk: "0", mobile: /^1[016-9]/, groups: [2, 4, 4] },
  SG: { lengths: [8], mobile: /^[89]/, groups: [4, 4] },
  MY: { lengths: [8, 9, 10], trunk: "0", mobile: /^1/, groups: [2, 3, 4] },
  TH: { lengths: [8, 9], trunk: "0", mobile: /^[689]/, groups: [2, 3, 4] },
  VN: { lengths: [9, 10], trunk: "0", mobile: /^[35789]/, groups: [3, 3, 3] },
  ID: { lengths: [8, 9, 10, 11, 12], trunk: "0", mobile: /^8/, groups: [3, 4, 4] },
  PH: { lengths: [9, 10], trunk: "0", mobile: /^9/, groups: [3, 3, 4] },
  PK: { lengths: [9, 10], trunk: "0", mobile: /^3/, groups: [3, 7] },
  BD: { lengths: [8, 9, 10], trunk: "0", mobile: /^1[3-9]/, groups: [4, 6] },
  LK: { lengths: [9], trunk: "0", mobile: /^7/, groups: [2, 3, 4] },
  HK: { lengths: [8], mobile: /^[5-9]/, groups: [4, 4] },
  TW: { lengths: [8, 9], trunk: "0", mobile: /^9/, groups: [1, 4, 4] },
  AE: { lengths: [8, 9], trunk: "0", mobile: /^5/, groups: [2, 3, 4] },
  SA: { lengths: [8, 9], trunk: "0", mobile: /^5/, groups: [2, 3, 4] },
  IL: { lengths: [8, 9], trunk: "0", mobile: /^5/, groups: [2, 3, 4] },
  TR: { lengths: [10], trunk: "0", mobile: /^5/, groups: [3, 3, 4] },
  KZ: { lengths: [10], trunk: "8", mobile: /^7/, groups: [3, 3, 4] },
  // Europe
  GB: { lengths: [9, 10], trunk: "0", mobile: /^7[1-9]/, groups: [4, 6] },
  DE: { lengths: [5, 6, 7, 8, 9, 10, 11, 12], trunk: "0", mobile: /^1[5-7]/, groups: [3, 8] },
  FR: { lengths: [9], trunk: "0", mobile: /^[67]/, groups: [1, 2, 2, 2, 2] },
  IT: { lengths: [6, 7, 8, 9, 10, 11], mobile: /^3/, groups: [3, 3, 4] },
  ES: { lengths: [9], mobile: /^[67]/, groups: [3, 3, 3] },
  PT: { lengths: [9], mobile: /^9/, groups: [3, 3, 3] },
  NL: { lengths: [9], trunk: "0", mobile: /^6/, groups: [2, 3, 4] },
  BE: { lengths: [8, 9], trunk: "0", mobile: /^4/, groups: [3, 2, 2, 2] },
  CH: { lengths: [9], trunk: "0", mobile: /^7[5-9]/, groups: [2, 3, 2, 2] },
  AT: { lengths: [7, 8, 9, 10, 11, 12, 13], trunk: "0", mobile: /^6/, groups: [3, 7] },
  SE: { lengths: [7, 8, 9], trunk: "0", mobile: /^7/, groups: [2, 3, 4] },
  NO: { lengths: [8], mobile: /^[49]/, groups: [3, 2, 3] },
  DK: { lengths: [8], groups: [2, 2, 2, 2] },
  FI: { lengths: [5, 6, 7, 8, 9, 10, 11, 12], trunk: "0", mobile: /^4|^50/, groups: [2, 3, 4] },
  IE: { lengths: [7, 8, 9], trunk: "0", mobile: /^8/, groups: [2, 3, 4] },
  PL: { lengths: [9], mobile: /^[4-8]/, groups: [3, 3, 3] },
  CZ: { lengths: [9], mobile: /^[67]/, groups: [3, 3, 3] },
  HU: { lengths: [8, 9], trunk: "06", mobile: /^[237]0/, groups: [2, 3, 4] },
  RO: { lengths: [9], trunk: "0", mobile: /^7/, groups: [3, 3, 3] },
  GR: { lengths: [10], mobile: /^69/, groups: [3, 3, 4] },
  UA: { lengths: [9], trunk: "0", mobile: /^[3-9]/, groups: [2, 3, 4] },
  RU: { lengths: [10], trunk: "8", mobile: /^9/, groups: [3, 3, 4] },
  // Americas
  MX: { lengths: [10], trunk: "01", groups: [2, 4, 4] },
  BR: { lengths: [10, 11], trunk: "0", mobile: /^\d{2}9/, groups: [2, 5, 4] },
  AR: { lengths: [10], trunk: "0", groups: [2, 4, 4] },
  CL: { lengths: [9], mobile: /^9/, groups: [1, 4, 4] },
  CO: { lengths: [10], mobile: /^3/, groups: [3, 3, 4] },
  PE: { lengths: [9], mobile: /^9/, groups: [3, 3, 3] },
  // Oceania
  AU: { lengths: [9], trunk: "0", mobile: /^4/, groups: [3, 3, 3] },
  NZ: { lengths: [8, 9, 10], trunk: "0", mobile: /^2/, groups: [2, 3, 4] },
  // Africa
  ZA: { lengths: [9], trunk: "0", mobile: /^[67]|^8[1-4]/, groups: [2, 3, 4] },
  NG: { lengths: [8, 10], trunk: "0", mobile: /^[789]/, groups: [3, 3, 4] },
  KE: { lengths: [9], trunk: "0", mobile: /^[17]/, groups: [3, 6] },
  EG: { lengths: [9, 10], trunk: "0", mobile: /^1/, groups: [2, 4, 4] },
  MA: { lengths: [9], trunk: "0", mobile: /^[67]/, groups: [3, 2, 2, 2] },
  GH: { lengths: [9], trunk: "0", mobile: /^[235]/, groups: [2, 3, 4] },
  ET: { lengths: [9], trunk: "0", mobile: /^9/, groups: [2, 3, 4] },
  TZ: { lengths: [9], trunk: "0", mobile: /^[67]/, groups: [2, 3, 4] },
};

/** Fallback for countries without a specific rule: E.164 allows up to 15 digits in total. */
export const GENERIC: Rule = { lengths: [4, 5, 6, 7, 8, 9, 10, 11, 12], trunk: "0" };
