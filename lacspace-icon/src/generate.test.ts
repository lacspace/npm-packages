import { describe, it, expect } from "vitest";
import { buildManifest } from "./manifest.js";
import { hexToRgba, createCanvas, compositeOver } from "./compose.js";
import { generateIcons, buildSnippet } from "./generate.js";
import { encodePng, isPng, decodePng } from "./png.js";

/** A small colourful source PNG (8x8) with a transparent border. */
function sourcePng(): Uint8Array {
  const size = 8;
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = (y * size + x) * 4;
      const border = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      rgba[p] = (x * 32) & 0xff;
      rgba[p + 1] = (y * 32) & 0xff;
      rgba[p + 2] = 128;
      rgba[p + 3] = border ? 0 : 255;
    }
  }
  return encodePng({ width: size, height: size, rgba });
}

describe("buildManifest", () => {
  it("has the expected shape and colours", () => {
    const m = buildManifest({ name: "My App", short: "App", theme: "#123456", bg: "#000000" });
    expect(m.name).toBe("My App");
    expect(m.short_name).toBe("App");
    expect(m.theme_color).toBe("#123456");
    expect(m.background_color).toBe("#000000");
    expect(m.display).toBe("standalone");
    expect(m.icons.map((i) => i.sizes)).toEqual(["192x192", "512x512"]);
  });

  it("adds a maskable icon entry when requested", () => {
    const m = buildManifest({ maskable: true });
    const maskable = m.icons.find((i) => i.purpose === "maskable");
    expect(maskable).toBeDefined();
    expect(maskable!.sizes).toBe("512x512");
  });

  it("defaults short_name to name", () => {
    expect(buildManifest({ name: "Solo" }).short_name).toBe("Solo");
  });
});

describe("compose helpers", () => {
  it("parses hex colours incl. shorthand and alpha", () => {
    expect(hexToRgba("#ffffff")).toEqual([255, 255, 255, 255]);
    expect(hexToRgba("#000")).toEqual([0, 0, 0, 255]);
    expect(hexToRgba("#ff000080")).toEqual([255, 0, 0, 128]);
  });

  it("fills a canvas and composites opaque over it", () => {
    const canvas = createCanvas(2, 2, "#000000");
    compositeOver(canvas, { width: 1, height: 1, rgba: Uint8Array.from([255, 255, 255, 255]) }, 0, 0);
    expect(Array.from(canvas.rgba.subarray(0, 4))).toEqual([255, 255, 255, 255]);
    // Untouched pixel stays black opaque.
    expect(Array.from(canvas.rgba.subarray(4, 8))).toEqual([0, 0, 0, 255]);
  });

  it("blends 50% alpha over a background", () => {
    const canvas = createCanvas(1, 1, "#000000");
    compositeOver(canvas, { width: 1, height: 1, rgba: Uint8Array.from([255, 255, 255, 128]) }, 0, 0);
    // ~ round(255 * 128/255) = 128.
    expect(canvas.rgba[0]).toBe(128);
    expect(canvas.rgba[3]).toBe(255);
  });
});

describe("generateIcons", () => {
  const { files, snippet, manifest } = generateIcons(sourcePng(), {
    name: "Lacspace", short: "Lac", bg: "#0b0b0f", theme: "#4d9fff", maskable: true, og: true,
  });

  it("produces every expected file", () => {
    const expected = [
      "favicon-16x16.png", "favicon-32x32.png", "favicon-48x48.png", "favicon.ico",
      "apple-touch-icon.png", "icon-192.png", "icon-512.png",
      "icon-maskable-512.png", "og.png", "manifest.webmanifest",
    ];
    for (const name of expected) expect(files[name], name).toBeDefined();
  });

  it("emits real PNGs at the right dimensions", () => {
    expect(isPng(files["favicon-16x16.png"]!)).toBe(true);
    const apple = decodePng(files["apple-touch-icon.png"]!);
    expect(apple.width).toBe(180);
    expect(apple.height).toBe(180);
    const og = decodePng(files["og.png"]!);
    expect(og.width).toBe(1200);
    expect(og.height).toBe(630);
    const icon512 = decodePng(files["icon-512.png"]!);
    expect(icon512.width).toBe(512);
  });

  it("apple-touch icon is fully opaque (bg filled)", () => {
    const apple = decodePng(files["apple-touch-icon.png"]!);
    // Corner pixel should be the opaque bg, not transparent.
    expect(apple.rgba[3]).toBe(255);
  });

  it("favicon.ico starts with the ICONDIR magic", () => {
    const ico = files["favicon.ico"]!;
    const view = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);
    expect(view.getUint16(0, true)).toBe(0);
    expect(view.getUint16(2, true)).toBe(1);
    expect(view.getUint16(4, true)).toBe(3);
  });

  it("manifest file parses and matches the returned object", () => {
    const parsed = JSON.parse(new TextDecoder().decode(files["manifest.webmanifest"]!));
    expect(parsed.name).toBe("Lacspace");
    expect(parsed).toEqual(manifest);
  });

  it("snippet contains the key head tags", () => {
    expect(snippet).toContain('rel="icon"');
    expect(snippet).toContain('href="/favicon.ico"');
    expect(snippet).toContain('rel="apple-touch-icon"');
    expect(snippet).toContain('rel="manifest"');
    expect(snippet).toContain('name="theme-color"');
    expect(snippet).toContain("#4d9fff");
  });

  it("omits maskable/og when not requested", () => {
    const { files: f2 } = generateIcons(sourcePng(), {});
    expect(f2["icon-maskable-512.png"]).toBeUndefined();
    expect(f2["og.png"]).toBeUndefined();
    expect(f2["favicon.ico"]).toBeDefined();
  });

  it("buildSnippet uses the default theme colour", () => {
    expect(buildSnippet()).toContain("#4d9fff");
  });
});
