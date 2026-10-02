import { fetchImpl, GoldSnapshot, MetalRate, SourceOptions, UA } from "../types.js";

const URL_TODAY = "https://api.fenegosida.org/api/website/v1/Dashboard/today";

function keyFor(label: string): string {
  if (/छापावाल|hallmark/i.test(label)) return "gold-hallmark";
  if (/तेजाबी|tejabi/i.test(label)) return "gold-tejabi";
  if (/चाँदी|silver/i.test(label)) return "silver";
  return label;
}

/** Parse FENEGOSIDA "today" rows (per tola + per 10 g pairs) into one rate per metal. */
export function parseFenegosida(rows: any[]): { date: string; rates: MetalRate[] } {
  const byKey = new Map<string, MetalRate>();
  let date = "";
  for (const r of rows ?? []) {
    const label = String(r.rateType ?? "");
    const key = keyFor(label);
    const today = Number(r.todayBaseRatePerGram);
    const yest = Number(r.yestardayBaseRatePerGram ?? r.yesterdayBaseRatePerGram);
    if (!Number.isFinite(today)) continue;
    date = date || String(r.todayDate ?? "").slice(0, 10);
    const isTola = /तोला|tola/i.test(label);
    const cur = byKey.get(key) ?? { key, label: label.replace(/\s*\(.*\)\s*$/, ""), perTola: 0 };
    if (isTola) {
      cur.perTola = today;
      if (Number.isFinite(yest)) {
        cur.previousPerTola = yest;
        cur.delta = today - yest;
      }
    } else {
      cur.per10g = today;
    }
    byKey.set(key, cur);
  }
  const order = ["gold-hallmark", "gold-tejabi", "silver"];
  const rank = (k: string) => { const i = order.indexOf(k); return i === -1 ? 99 : i; };
  const rates = [...byKey.values()].filter((r) => r.perTola > 0).sort((a, b) => rank(a.key) - rank(b.key));
  return { date, rates };
}

/** Official FENEGOSIDA (Federation of Nepal Gold & Silver Dealers) daily rates. */
export async function fenegosidaGold(options: SourceOptions = {}): Promise<GoldSnapshot> {
  const res = await fetchImpl(options.fetch)(URL_TODAY, { headers: UA, signal: options.signal });
  if (!res.ok) throw new Error(`fenegosida ${res.status}`);
  const { date, rates } = parseFenegosida(await res.json());
  if (!rates.length) throw new Error("fenegosida: no rates");
  return { kind: "gold", date, rates, source: "FENEGOSIDA", url: URL_TODAY, fetchedAt: new Date().toISOString() };
}
