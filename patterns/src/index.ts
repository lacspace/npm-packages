/**
 * @lacspace/patterns — rule-based chart-pattern detection on OHLCV bars.
 *
 * ATR-sized swings (zigzag), harmonic XABCD patterns (Gartley, Bat, Alt Bat, Butterfly,
 * Crab, Deep Crab, Cypher, AB=CD) with potential-reversal zones, an Elliott impulse count
 * that obeys the three hard rules, classic chart patterns (double tops/bottoms, head &
 * shoulders, triangles, wedges, channels, ranges), per-session TPO market profiles and
 * volume profiles, plus Kagi and Point & Figure transforms.
 *
 * Descriptive geometry of what is already on the chart — never a forecast or advice.
 * Results are drawing-ready (`paths`, `zones`, `profiles`) and also returned as data
 * (`hits`, `found`). Contributed by the ShareRocketPro team; zero-dependency.
 */

export type { Bar, Series, StudyZone } from "./core.js";
export { atr, rma, trueRange, volumeProfile } from "./core.js";
export {
  swings,
  harmonics,
  elliott,
  chartPatterns,
  tpoProfiles,
  sessionVolumeProfiles,
  type StudyPath,
  type StudyProfile,
  type Pivot,
  type HarmonicHit,
} from "./patterns.js";
export { kagi, pointFigure, type KagiLine, type PnfColumn } from "./altCharts.js";

const VERSION = "1.0.0";
const bars = { type: "array", description: "OHLCV bars: { time (unix s), open, high, low, close, volume }[]" };

/** describe() for agents/conductors. */
export function describe() {
  return {
    name: "@lacspace/patterns",
    version: VERSION,
    summary: "Rule-based chart-pattern detection on OHLCV: ATR swings, harmonics, Elliott impulse count, double tops/bottoms, head & shoulders, triangles/wedges/channels, TPO and session volume profiles, Kagi and Point & Figure. Descriptive only.",
    commands: [
      { name: "swings", input: { type: "object", properties: { bars, k: { type: "number", default: 2 } }, required: ["bars"] }, output: "{ piv: Pivot[], tail: Pivot|null, atr: number[] }" },
      { name: "harmonics", input: { type: "object", properties: { bars, k: { type: "number", default: 2 }, tolPct: { type: "number", default: 6 }, show: { type: "integer", default: 3 } }, required: ["bars"] }, output: "{ paths, zones, hits: HarmonicHit[] }" },
      { name: "elliott", input: { type: "object", properties: { bars, k: { type: "number", default: 2 } }, required: ["bars"] }, output: "{ paths, zones }" },
      { name: "chartPatterns", input: { type: "object", properties: { bars, k: { type: "number", default: 1.5 }, look: { type: "integer", default: 200 }, show: { type: "integer", default: 2 } }, required: ["bars"] }, output: "{ paths, zones, found: string[] }" },
      { name: "tpoProfiles", input: { type: "object", properties: { bars, rowsWanted: { type: "integer", default: 24 }, sessionsShown: { type: "integer", default: 5 } }, required: ["bars"] }, output: "StudyProfile[]" },
      { name: "sessionVolumeProfiles", input: { type: "object", properties: { bars, rows: { type: "integer", default: 20 }, sessionsShown: { type: "integer", default: 5 } }, required: ["bars"] }, output: "StudyProfile[]" },
      { name: "kagi", input: { type: "object", properties: { bars, rev: { type: "number" } }, required: ["bars", "rev"] }, output: "{ bars, lines }" },
      { name: "pointFigure", input: { type: "object", properties: { bars, box: { type: "number" }, rev: { type: "integer", default: 3 } }, required: ["bars", "box"] }, output: "{ bars, cols }" },
    ],
  };
}
