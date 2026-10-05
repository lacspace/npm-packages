/**
 * Ready-made terms for Nepal's 77 districts (names from @lacspace/nepali-utils), with the
 * spellings that actually turn up in copy: काठमाण्डौ, Kavre/काभ्रे, Rukum East/रुकुम पूर्व …
 */
import { DISTRICTS } from "@lacspace/nepali-utils";
import type { TermInput } from "./index.js";

export interface DistrictTerm {
  id: string;
  en: string[];
  ne: string[];
  province: number;
  /** The Nepali name is also an everyday word (पर्वत = mountain): confirm with context before tagging. */
  ambiguous?: boolean;
  caseSensitive: true;
}

const ALIASES: Record<string, { en?: string[]; ne?: string[] }> = {
  Kathmandu: { en: ["Katmandu"], ne: ["काठमाण्डौ", "काठमान्डु"] },
  Kavrepalanchok: { en: ["Kavre", "Kabhre", "Kabhrepalanchok", "Kavrepalanchowk"], ne: ["काभ्रे", "काभ्रेपलान्चोक"] },
  Sindhupalchok: { en: ["Sindhupalchowk"] },
  Solukhumbu: { en: ["Solu Khumbu"], ne: ["सोलु खुम्बु"] },
  "Nawalparasi East": { en: ["Nawalparasi (East)", "East Nawalparasi", "Nawalpur", "Bardaghat Susta East"], ne: ["नवलपरासी पूर्व", "पूर्वी नवलपरासी", "नवलपुर", "बर्दघाट सुस्ता पूर्व"] },
  "Nawalparasi West": { en: ["Nawalparasi (West)", "West Nawalparasi", "Bardaghat Susta West"], ne: ["नवलपरासी पश्चिम", "पश्चिमी नवलपरासी", "बर्दघाट सुस्ता पश्चिम"] },
  "Eastern Rukum": { en: ["Rukum East", "East Rukum", "Rukum (East)"], ne: ["रुकुम पूर्व"] },
  "Western Rukum": { en: ["Rukum West", "West Rukum", "Rukum (West)"], ne: ["रुकुम पश्चिम"] },
  Tanahun: { en: ["Tanahu"], ne: ["तनहु"] },
  Dhanusha: { en: ["Dhanusa"] },
  Kapilvastu: { en: ["Kapilbastu"], ne: ["कपिलबस्तु"] },
  Makwanpur: { en: ["Makawanpur"] },
  Sankhuwasabha: { en: ["Sankhuwasava"] },
  Terhathum: { en: ["Tehrathum"], ne: ["तेहथुम"] },
  Okhaldhunga: { ne: ["ओखलढुङ्गा"] },
  Syangja: { en: ["Syanja"], ne: ["स्याङजा"] },
  Achham: { en: ["Accham"] },
  Udayapur: { en: ["Udaypur"] },
  Bardiya: { en: ["Bardia"] },
  Ilam: { en: ["Illam"] },
  Baglung: { ne: ["बाग्लुङ"] },
  Rupandehi: { ne: ["रुपन्देही"] },
  Dadeldhura: { ne: ["डँडेलधुरा"] },
  Mahottari: { ne: ["महोतरी"] },
};

/** District whose Nepali name is a common word. */
const AMBIGUOUS = new Set(["Parbat"]);

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Every district as a {@link TermInput}: ids are slugs ("nawalparasi-east"), English is exact-case. */
export function districtTerms(): DistrictTerm[] {
  return DISTRICTS.map((d) => {
    const extra = ALIASES[d.name] ?? {};
    // nepali-utils' own aliases (Rukum Purba, Parasi/परासी, Bardaghat Susta …), split by script.
    const own = d.aliases ?? [];
    const isNe = (x: string): boolean => /[\u0900-\u097f]/.test(x);
    const ne = new Set<string>([d.nameNp, ...(extra.ne ?? []), ...own.filter(isNe)]);
    for (const n of [...ne]) if (n.endsWith("ङ")) ne.add(n.slice(0, -1) + "ंग"); // मोरङ / मोरंग
    return {
      id: slug(d.name),
      en: [...new Set([d.name, ...(extra.en ?? []), ...own.filter((x) => !isNe(x))])],
      ne: [...ne],
      province: d.province,
      ...(AMBIGUOUS.has(d.name) ? { ambiguous: true } : {}),
      caseSensitive: true,
    } satisfies DistrictTerm & TermInput;
  });
}
