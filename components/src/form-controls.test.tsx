import { describe, it, expect } from "vitest";
import {
  clampNumber,
  debounce,
  decimalPlaces,
  defaultComboboxFilter,
  distributePin,
  filterOptions,
  firstEmptyPinIndex,
  formatBytes,
  formatNumberValue,
  groupThousands,
  hexWithoutAlpha,
  isValidHex,
  matchesAccept,
  moveHighlight,
  moveThumb,
  nearestThumb,
  nextEnabledIndex,
  normalizeHex,
  orderThumbs,
  padPin,
  parseNumericInput,
  percentToSliderValue,
  roundTo,
  scorePassword,
  setThumbValue,
  sliderValueToPercent,
  snapToStep,
  stepNumber,
  toggleSelection,
  validateFiles,
  type ComboboxOption,
  type FileLike,
  type SliderScale,
} from "./form-controls.js";

const scale: SliderScale = { min: 0, max: 100, step: 10 };

describe("slider maths", () => {
  it("snaps a loose value to the nearest step", () => {
    expect(snapToStep(43, scale)).toBe(40);
    expect(snapToStep(46, scale)).toBe(50);
  });

  it("counts steps from the minimum rather than from zero", () => {
    expect(snapToStep(12, { min: 5, max: 100, step: 10 })).toBe(15);
  });

  it("keeps a fractional step free of floating point dust", () => {
    expect(snapToStep(0.3, { min: 0, max: 1, step: 0.1 })).toBe(0.3);
    expect(snapToStep(0.7000000001, { min: 0, max: 1, step: 0.1 })).toBe(0.7);
  });

  it("clamps a value that falls outside the range", () => {
    expect(snapToStep(-40, scale)).toBe(0);
    expect(snapToStep(400, scale)).toBe(100);
  });

  it("converts a value to a position along the track", () => {
    expect(sliderValueToPercent(25, { min: 0, max: 100, step: 1 })).toBe(25);
    expect(sliderValueToPercent(5, { min: 0, max: 20, step: 1 })).toBe(25);
    expect(sliderValueToPercent(999, scale)).toBe(100);
  });

  it("converts a position back into a stepped value", () => {
    expect(percentToSliderValue(44, scale)).toBe(40);
    expect(percentToSliderValue(-10, scale)).toBe(0);
    expect(percentToSliderValue(140, scale)).toBe(100);
  });

  it("orders a reversed pair of thumbs", () => {
    expect(orderThumbs([80, 20])).toEqual([20, 80]);
  });

  it("stops the lower thumb from passing the upper thumb", () => {
    expect(setThumbValue([20, 60], 0, 90, { min: 0, max: 100, step: 1 })).toEqual([60, 60]);
    expect(setThumbValue([20, 60], 1, 10, { min: 0, max: 100, step: 1 })).toEqual([20, 20]);
  });

  it("leaves the other thumb alone when one moves inside the range", () => {
    expect(setThumbValue([20, 60], 0, 35, { min: 0, max: 100, step: 5 })).toEqual([35, 60]);
  });

  it("moves one step for an arrow key and ten for a page key", () => {
    expect(moveThumb(40, "ArrowRight", scale)).toBe(50);
    expect(moveThumb(40, "ArrowDown", scale)).toBe(30);
    expect(moveThumb(0, "PageUp", { min: 0, max: 100, step: 1 })).toBe(10);
    expect(moveThumb(50, "PageDown", { min: 0, max: 100, step: 1 })).toBe(40);
  });

  it("jumps to the ends for Home and End and ignores anything else", () => {
    expect(moveThumb(40, "Home", scale)).toBe(0);
    expect(moveThumb(40, "End", scale)).toBe(100);
    expect(moveThumb(40, "Enter", scale)).toBeNull();
  });

  it("grabs the thumb closest to a track click", () => {
    expect(nearestThumb([20, 80], 30)).toBe(0);
    expect(nearestThumb([20, 80], 70)).toBe(1);
  });
});

describe("number parsing and formatting", () => {
  it("reads a number written with thousands separators", () => {
    expect(parseNumericInput("1,234.56")).toBe(1234.56);
    expect(parseNumericInput("  -42 ")).toBe(-42);
  });

  it("reads a locale that swaps the separators", () => {
    expect(parseNumericInput("1.234,5", { thousandsSeparator: ".", decimalSeparator: "," })).toBe(
      1234.5,
    );
  });

  it("returns null for empty or unparseable text", () => {
    expect(parseNumericInput("")).toBeNull();
    expect(parseNumericInput("abc")).toBeNull();
    expect(parseNumericInput("12.5.6")).toBeNull();
  });

  it("groups the integer part when formatting", () => {
    expect(groupThousands("1234567")).toBe("1,234,567");
    expect(formatNumberValue(1234567.891, { thousands: true, precision: 2 })).toBe("1,234,567.89");
    expect(formatNumberValue(-1500, { thousands: true })).toBe("-1,500");
  });

  it("rounds to the configured precision", () => {
    expect(roundTo(1.239, 2)).toBe(1.24);
    expect(formatNumberValue(2.345, { precision: 1 })).toBe("2.3");
    expect(decimalPlaces(0.001)).toBe(3);
    expect(decimalPlaces(1e-7)).toBe(7);
  });

  it("clamps into the bounds that were given, ignoring the ones that were not", () => {
    expect(clampNumber(120, 0, 100)).toBe(100);
    expect(clampNumber(-5, 0)).toBe(0);
    expect(clampNumber(-5, undefined, 100)).toBe(-5);
  });

  it("steps by one step and lands on the minimum from an empty field", () => {
    expect(stepNumber(4, 1, { step: 0.5, min: 0, max: 10 })).toBe(4.5);
    expect(stepNumber(10, 1, { step: 1, max: 10 })).toBe(10);
    expect(stepNumber(null, 1, { step: 5, min: 3 })).toBe(3);
  });
});

describe("pin distribution", () => {
  it("spreads a pasted code across every box", () => {
    expect(distributePin(["", "", "", "", "", ""], "123456", 0, 6)).toEqual([
      "1", "2", "3", "4", "5", "6",
    ]);
  });

  it("only fills the boxes from the caret onwards", () => {
    expect(distributePin(["9", "", "", ""], "1234", 1, 4)).toEqual(["9", "1", "2", "3"]);
  });

  it("drops characters the pin type does not accept", () => {
    expect(distributePin(["", "", "", "", "", ""], "12-34 56", 0, 6)).toEqual([
      "1", "2", "3", "4", "5", "6",
    ]);
    expect(distributePin(["", "", ""], "a1b2", 0, 3, "alphanumeric")).toEqual(["a", "1", "b"]);
  });

  it("pads and reports the first empty box", () => {
    expect(padPin("12", 4)).toEqual(["1", "2", "", ""]);
    expect(firstEmptyPinIndex(["1", "2", "", ""])).toBe(2);
    expect(firstEmptyPinIndex(["1", "2"])).toBe(-1);
  });
});

describe("combobox filtering and highlighting", () => {
  const options: ComboboxOption[] = [
    { value: "np", label: "Nepal" },
    { value: "nl", label: "Netherlands" },
    { value: "in", label: "India", disabled: true },
    { value: "id", label: "Indonesia" },
  ];

  it("matches the query case-insensitively against label and value", () => {
    expect(filterOptions(options, "neth").map((option) => option.value)).toEqual(["nl"]);
    expect(filterOptions(options, "IND").map((option) => option.value)).toEqual(["in", "id"]);
    expect(filterOptions(options, "np").map((option) => option.value)).toEqual(["np"]);
    expect(filterOptions(options, "  ").length).toBe(4);
  });

  it("uses a custom filter when one is given", () => {
    const startsWith = (option: ComboboxOption, query: string): boolean =>
      option.label.toLowerCase().startsWith(query.toLowerCase());
    expect(filterOptions(options, "ne", startsWith).map((option) => option.value)).toEqual([
      "np",
      "nl",
    ]);
    expect(filterOptions(options, "ia", startsWith)).toEqual([]);
    expect(defaultComboboxFilter({ value: "x", label: "Xylophone" }, "phone")).toBe(true);
  });

  it("wraps the highlight at both ends of the list", () => {
    expect(moveHighlight(-1, 1, 4)).toBe(0);
    expect(moveHighlight(-1, -1, 4)).toBe(3);
    expect(moveHighlight(3, 1, 4)).toBe(0);
    expect(moveHighlight(0, -1, 4)).toBe(3);
    expect(moveHighlight(0, -1, 4, false)).toBe(0);
    expect(moveHighlight(0, 1, 0)).toBe(-1);
  });

  it("skips disabled rows when moving the highlight", () => {
    expect(nextEnabledIndex(options, 1, 1)).toBe(3);
    expect(nextEnabledIndex(options, 3, -1)).toBe(1);
    expect(nextEnabledIndex([{ disabled: true }, { disabled: true }], -1, 1)).toBe(-1);
  });
});

describe("password strength", () => {
  it("rates a short single-case password as very weak", () => {
    expect(scorePassword("abc").score).toBe(0);
  });

  it("improves as length and character variety grow", () => {
    const short = scorePassword("Abcdef1!");
    const long = scorePassword("Abcdefgh1234!@#$");
    expect(long.score).toBeGreaterThan(short.score);
    expect(long.score).toBe(4);
    expect(long.percent).toBe(100);
  });

  it("vetoes a password from the common list however it is cased", () => {
    expect(scorePassword("password").score).toBe(0);
    expect(scorePassword("QWERTY123").score).toBe(0);
    expect(scorePassword("password").suggestions[0]).toMatch(/common/i);
  });

  it("suggests exactly what is missing", () => {
    const weak = scorePassword("alllowercase");
    expect(weak.suggestions).toContain("Add a number");
    expect(weak.suggestions).toContain("Mix upper and lower case");
    expect(scorePassword("").label).toBe("Very weak");
  });
});

describe("file validation", () => {
  const file = (name: string, size: number, type = ""): FileLike => ({ name, size, type });

  it("matches an accept list by extension, mime type and wildcard", () => {
    expect(matchesAccept(file("a.PDF", 10), ".pdf")).toBe(true);
    expect(matchesAccept(file("a.png", 10, "image/png"), "image/*")).toBe(true);
    expect(matchesAccept(file("a.txt", 10, "text/plain"), "image/*,.pdf")).toBe(false);
    expect(matchesAccept(file("a.txt", 10, "text/plain"), "")).toBe(true);
  });

  it("rejects files over the size limit with a reason", () => {
    const result = validateFiles([file("big.png", 5_000_000, "image/png")], {
      maxSize: 1024 * 1024,
    });
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0]?.reason).toBe("size");
    expect(result.rejected[0]?.message).toContain("1 MB");
  });

  it("keeps only the first file when multiple is off", () => {
    const result = validateFiles([file("a.png", 1), file("b.png", 1)], { multiple: false });
    expect(result.accepted.map((entry) => entry.name)).toEqual(["a.png"]);
    expect(result.rejected[0]?.reason).toBe("count");
  });

  it("counts files already picked against maxFiles and spots duplicates", () => {
    const existing = [file("a.png", 1)];
    const result = validateFiles([file("a.png", 1), file("b.png", 1), file("c.png", 1)], {
      maxFiles: 2,
      existing,
    });
    expect(result.accepted.map((entry) => entry.name)).toEqual(["b.png"]);
    expect(result.rejected.map((entry) => entry.reason)).toEqual(["duplicate", "count"]);
  });

  it("prints byte sizes a human can read", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
  });
});

describe("hex colour handling", () => {
  it("expands a short hex to the long form", () => {
    expect(normalizeHex("#abc")).toBe("#aabbcc");
    expect(normalizeHex("ABC")).toBe("#aabbcc");
    expect(normalizeHex("#AABBCC")).toBe("#aabbcc");
    expect(normalizeHex("#abcd")).toBe("#aabbccdd");
  });

  it("returns null for anything that is not a hex colour", () => {
    expect(normalizeHex("rebeccapurple")).toBeNull();
    expect(normalizeHex("#ab")).toBeNull();
    expect(isValidHex("#12345")).toBe(false);
    expect(isValidHex("#123456")).toBe(true);
  });

  it("drops the alpha pair for the native colour swatch", () => {
    expect(hexWithoutAlpha("#aabbccdd")).toBe("#aabbcc");
    expect(hexWithoutAlpha("nonsense")).toBe("#000000");
  });
});

describe("toggle selection", () => {
  it("replaces the selection in single mode", () => {
    expect(toggleSelection(["a"], "b")).toEqual(["b"]);
  });

  it("clears a single selection only when deselecting is allowed", () => {
    expect(toggleSelection(["a"], "a", { allowDeselect: true })).toEqual([]);
    expect(toggleSelection(["a"], "a", { allowDeselect: false })).toEqual(["a"]);
  });

  it("adds and removes in multiple mode", () => {
    expect(toggleSelection(["a"], "b", { multiple: true })).toEqual(["a", "b"]);
    expect(toggleSelection(["a", "b"], "a", { multiple: true })).toEqual(["b"]);
  });

  it("ignores a pick once the maximum is reached", () => {
    expect(toggleSelection(["a", "b"], "c", { multiple: true, max: 2 })).toEqual(["a", "b"]);
    expect(toggleSelection(["a", "b"], "b", { multiple: true, max: 2 })).toEqual(["a"]);
  });
});

describe("debounce", () => {
  it("fires once with the last arguments after the quiet period", async () => {
    const seen: string[] = [];
    const run = debounce((query: string) => seen.push(query), 10);
    run("a");
    run("ab");
    run("abc");
    expect(seen).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(seen).toEqual(["abc"]);
  });

  it("does not fire after it is cancelled", async () => {
    const seen: string[] = [];
    const run = debounce((query: string) => seen.push(query), 10);
    run("a");
    run.cancel();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(seen).toEqual([]);
  });
});
