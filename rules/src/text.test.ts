import { describe, expect, it } from "vitest";
import { cleanRules, evaluate, parseRules, rulesToText, STRATEGY_TEMPLATES, type RBar } from "./index.js";

describe("text form (1.2.0)", () => {
  it("parses the founder-style sentence into the same JSON the AI writes", () => {
    const { rules, errors } = parseRules(`
      name: EMA cross with RSI filter
      buy when ema(20) crosses above ema(50) and rsi(14) > 50
      sell when ema(20) crosses below ema(50)
      stop 2 atr`);
    expect(errors).toEqual([]);
    expect(rules).toEqual(STRATEGY_TEMPLATES.find((t) => t.name === "EMA cross with RSI filter"));
  });

  it("round-trips every template: rules → text → rules", () => {
    for (const t of STRATEGY_TEMPLATES) {
      const text = rulesToText(t);
      expect(parseRules(text)).toEqual({ rules: cleanRules(t), errors: [] });
    }
    expect(rulesToText(STRATEGY_TEMPLATES[2]!)).toBe(
      "name: Breakout on volume\nbuy when close crosses above highest(20) and volume > 1.5 * vol_avg(20)\nsell when close crosses below lowest(10)\nstop 1.5 atr\ntarget 3 atr",
    );
  });

  it("accepts friendly variants: aliases, 'is above', ';' separators, comments, sources", () => {
    const { rules, errors } = parseRules("buy when close is above ema(50, high) or supertrend(10, 3) > 0 # trend; exit: rsi(14) crossed under 70; stop at 2.5 x atr");
    expect(errors).toEqual([]);
    expect(rules!.entry).toEqual({ mode: "any", conds: [
      { a: { k: "price", src: "close" }, op: ">", b: { k: "ema", n: 50, src: "high" } },
      { a: { k: "stDir", n: 10, m: 3 }, op: ">", b: { k: "num", v: 0 } },
    ] });
    expect(rules!.exit.conds[0]!.op).toBe("crossBelow");
    expect(rules!.stopAtr).toBe(2.5);
  });

  it("reports errors with line and column", () => {
    expect(parseRules("buy when rsi(14) >> 30").errors[0]).toMatchObject({ line: 1, message: expect.stringContaining("Expected a value") });
    expect(parseRules("buy when foo(3) > 1").errors[0]).toMatchObject({ line: 1, col: 10, message: expect.stringContaining('Unknown indicator "foo"') });
    expect(parseRules("buy when ema > 1").errors[0]!.message).toContain("needs a length");
    expect(parseRules("buy when close > ema(50) and rsi(14) > 50 or rsi(14) < 20").errors[0]!.message).toContain('only "and" or only "or"');
    expect(parseRules("sell when close < ema(20)").errors[0]!.message).toContain("No entry rule");
    expect(parseRules("hello").errors[0]!.message).toContain("Start the line");
  });

  it("parsed rules evaluate exactly like the JSON ones", () => {
    const closes = [10, 10, 10, 10, 10, 9, 8, 9, 11, 13, 14, 13];
    const b: RBar[] = closes.map((c, i) => ({ time: i, open: c, high: c + 0.5, low: c - 0.5, close: c, volume: 1 }));
    const fromText = parseRules("buy when close crosses above sma(3)").rules!;
    expect(evaluate(fromText, b).entry.map((v, i) => (v ? i : -1)).filter((i) => i >= 0)).toEqual([7]);
  });
});
