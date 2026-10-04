/**
 * @lacspace/rules — trading rules as data: a small, safe JSON rule language for
 * "buy when …, sell when …", evaluated per candle on OHLCV arrays, plus a next-open
 * backtester and a last-candle screener that share the exact same engine.
 *
 * Built by the ShareRocketPro team, where it drives the strategy builder, backtests and
 * server-side alerts. AI only translates words into the JSON; `cleanRules` coerces or
 * drops anything unknown, so AI-written rules can never run arbitrary code.
 */

export {
  evaluate,
  cleanRules,
  describeRules,
  describeCond,
  describeOperand,
  defaultOperand,
  operandSeries,
  OPERAND_KINDS,
  OPS,
  STRATEGY_TEMPLATES,
  type RBar,
  type Src,
  type Operand,
  type Op,
  type Cond,
  type Group,
  type Rules,
} from "./strategy.js";
export { runBacktest, backtestRules, rulesStrategy, type StrategyDef, type BtOptions, type BtTrade, type BtResult } from "./backtest.js";
export { parseRules, rulesToText, condToText, operandToText, type ParseResult, type ParseError } from "./text.js";
export { screen, type ScreenSymbol, type ScreenOptions, type ScreenHit, type ScreenResult } from "./screen.js";

const VERSION = "1.2.0";

/** describe() for agents/conductors. */
export function describe() {
  return {
    name: "@lacspace/rules",
    version: VERSION,
    summary: "Trading rules as JSON (operands: num, price, sma, ema, rsi, macd/macdSignal/macdHist, atr, bbUpper/bbMid/bbLower, stDir, highest/lowest, volAvg, change; ops >, <, crossAbove, crossBelow; all/any groups; ATR stop/target). Validate with cleanRules, evaluate per candle, backtest (next-open fills), screen many symbols.",
    commands: [
      { name: "cleanRules", input: { type: "object", description: "Any JSON (e.g. AI output) → Rules or null" }, output: "Rules | null" },
      { name: "evaluate", input: { type: "object", properties: { rules: { type: "object" }, bars: { type: "array" } }, required: ["rules", "bars"] }, output: "{ entry: boolean[], exit: boolean[], atr, need }" },
      { name: "backtestRules", input: { type: "object", properties: { bars: { type: "array" }, rules: { type: "object" }, options: { type: "object", properties: { capital: { type: "number" }, costPct: { type: "number" }, direction: { enum: ["long", "both"] } } } }, required: ["bars", "rules"] }, output: "BtResult { trades, equity, netPct, winRate, profitFactor, maxDdPct, … }" },
      { name: "screen", input: { type: "object", properties: { universe: { type: "array", description: "{ symbol, bars, sector?, meta? }[]" }, options: { type: "object" } }, required: ["universe"] }, output: "{ hits: ScreenHit[], skipped }" },
      { name: "parseRules", input: { type: "object", properties: { text: { type: "string", description: "e.g. \"buy when ema(20) crosses above ema(50) and rsi(14) > 50\\nsell when ema(20) crosses below ema(50)\\nstop 2 atr\"" } }, required: ["text"] }, output: "{ rules: Rules | null, errors: [{ line, col, message }] }" },
      { name: "rulesToText", input: { type: "object", properties: { rules: { type: "object" } }, required: ["rules"] }, output: "string (canonical text form)" },
      { name: "describeRules", input: { type: "object", properties: { rules: { type: "object" } }, required: ["rules"] }, output: "string (plain English)" },
    ],
  };
}
