import { fetchImpl, FuelPrice, FuelSnapshot, SourceOptions, UA } from "../types.js";

const URL_HOME = "https://noc.org.np/";

const LABELS: Array<{ re: RegExp; key: FuelPrice["key"]; label: string; unit: string }> = [
  { re: /petrol/i, key: "petrol", label: "Petrol", unit: "Ltr" },
  { re: /diesel/i, key: "diesel", label: "Diesel", unit: "Ltr" },
  { re: /kerosene/i, key: "kerosene", label: "Kerosene", unit: "Ltr" },
  { re: /lp\s*gas|lpg|cylinder/i, key: "lpg", label: "LPG (14.2 kg)", unit: "Cyl" },
  { re: /atf|aviation/i, key: "atf", label: "ATF", unit: "Ltr" },
];

/**
 * Parse the NOC home page price tiles ("Petrol/Ltr … Rs 197.5 /Ltr"). Resilient to markup
 * changes: it scans text in document order, pairing each fuel label with the next "Rs N".
 */
export function parseNocHtml(html: string): FuelPrice[] {
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, "\n").replace(/&nbsp;/g, " ");
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out = new Map<string, FuelPrice>();
  for (let i = 0; i < lines.length; i++) {
    const def = LABELS.find((d) => d.re.test(lines[i]!) && /\/|rate|price/i.test(lines[i]!) === true);
    if (!def || out.has(def.key)) continue;
    for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
      const m = lines[j]!.match(/Rs\.?\s*([\d,]+(?:\.\d+)?)/i);
      if (m) {
        out.set(def.key, { key: def.key, label: def.label, unit: def.unit, price: Number(m[1]!.replace(/,/g, "")) });
        break;
      }
    }
  }
  return [...out.values()];
}

/** Nepal Oil Corporation retail prices (Kathmandu). Pass `previous` to get deltas. */
export async function nocFuel(options: SourceOptions & { previous?: FuelPrice[] } = {}): Promise<FuelSnapshot> {
  const res = await fetchImpl(options.fetch)(URL_HOME, { headers: UA, signal: options.signal });
  if (!res.ok) throw new Error(`noc ${res.status}`);
  let prices = parseNocHtml(await res.text());
  if (!prices.length) throw new Error("noc: no prices found");
  if (options.previous) {
    const prev = new Map(options.previous.map((p) => [p.key, p.price]));
    prices = prices.map((p) => (prev.has(p.key) ? { ...p, delta: Math.round((p.price - prev.get(p.key)!) * 100) / 100 } : p));
  }
  return { kind: "fuel", date: new Date().toISOString().slice(0, 10), prices, source: "Nepal Oil Corporation", url: URL_HOME, fetchedAt: new Date().toISOString() };
}
