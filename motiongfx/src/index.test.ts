import { describe, expect, it } from "vitest";
import { accentFor, brandSting, describe as describeApi, lowerThird, shortsFromLandscape, stinger, ticker } from "./index.js";

const brand = { primary: "#C8102E", secondary: "#0B1F3A", ink: "#111111", fontFile: "/fonts/Mukta-Bold.ttf", fontFileNe: "/fonts/Mukta-Bold.ttf" };

describe("lower thirds", () => {
  it("slide: band + accent tab + title/subtitle with eased x and category colour", () => {
    const f = lowerThird({ title: "सुरेशकुमार महतो", subtitle: "केन्द्र प्रमुख", start: 2, end: 6, category: "economy" }, brand, "landscape");
    expect(f).toHaveLength(4);
    expect(f[0]).toContain("drawbox=x='(80-");
    expect(f[0]).toContain("0x0B1F3A@0.72");
    expect(f[1]).toContain("0x0E7C3A"); // economy green tab
    expect(f[2]).toContain("text='सुरेशकुमार महतो'");
    expect(f[2]).toContain("enable='between(t,2,6)'");
    expect(f[2]).toMatch(/min\(1,max\(0,\(t-2\)\/0\.35\)\)/); // eased entry
    expect(f[2]).toMatch(/\(6-t\)\/0\.3/); // eased exit
    expect(f[3]).toContain("fontsize=");
  });
  it("breaking urgency forces the brand primary; wipe + pop animate differently; safe areas scale with preset", () => {
    expect(accentFor("sports", brand, "breaking")).toBe("#C8102E");
    const wipe = lowerThird({ title: "Budget passed", start: 0, end: 3, animation: "wipe" }, brand, "reels");
    expect(wipe[0]).toMatch(/w='760\*/); // bar grows
    const pop = lowerThird({ title: "Budget passed", start: 0, end: 3, animation: "pop" }, brand, "square");
    expect(pop[0]).toMatch(/y='\(\d+\+24\*\(1-/); // rises 24px
    const reels = lowerThird({ title: "x", start: 0, end: 1 }, brand, "reels")[0]!;
    expect(reels).toMatch(/y=1390/); // 1920 - 380 safe - 150
  });
});

describe("stingers + ticker", () => {
  it("bar stinger drops from above the safe top; flash and corner variants", () => {
    const bar = stinger({ label: "ताजा खबर", start: 1 }, brand, "landscape");
    expect(bar[0]).toContain("drawbox=x=0:y='(60-110*(1-");
    expect(bar[0]).toContain("0xC8102E@0.95");
    expect(bar[1]).toContain("text='ताजा खबर'");
    expect(bar[1]).toContain("between(t,1,3.5)");
    const flash = stinger({ label: "live", start: 0, style: "flash", duration: 2 }, brand, "landscape");
    expect(flash[0]).toContain("color=white@0.9");
    expect(flash[2]).toContain("text='LIVE'");
    const corner = stinger({ label: "LIVE", start: 0, style: "corner" }, brand, "shorts");
    expect(corner[1]).toContain("alpha='if(lt(mod(t,1),0.5),1,0.85)'"); // blink
  });
  it("ticker scrolls right→left along the bottom safe edge with a label", () => {
    const f = ticker({ items: ["NEPSE +12", "USD 154.41", "Weather: rain"], start: 0, end: 20, label: "ताजा" }, brand, "landscape");
    expect(f[0]).toContain("y=926"); // 1080 - 90 - 64
    expect(f[1]).toContain("x='w-mod((t-0)*140,w+text_w)'");
    expect(f[1]).toContain("NEPSE +12   •   USD 154.41");
    expect(f[2]).toContain("w=170");
    expect(f[3]).toContain("text='ताजा'");
  });
});

describe("sting + shorts", () => {
  it("brandSting builds a lavfi colour + logo zoom/fade with optional tagline", () => {
    const s = brandSting({ logo: "logo.png", output: "sting.mp4", tagline: "WeNepal" }, brand);
    expect(s.duration).toBe(1.6);
    expect(s.args).toContain("lavfi");
    expect(s.args.join(" ")).toContain("color=c=0x0B1F3A:s=1920x1080:r=30:d=1.6");
    expect(s.args.join(" ")).toContain("fade=t=out:st=1.25");
    expect(s.args.join(" ")).toContain("text='WeNepal'");
    expect(s.args[s.args.length - 1]).toBe("sting.mp4");
  });
  it("shortsFromLandscape fits the picture by width with a blurred dimmed fill", () => {
    const r = shortsFromLandscape("x1", "vout");
    expect(r.picture).toEqual({ x: 0, y: 656, w: 1080, h: 608 });
    expect(r.filter).toContain("[x1]split=2[bgsrc][fg]");
    expect(r.filter).toContain("gblur=sigma=30");
    expect(r.filter).toContain("[fg]scale=1080:608[pic]");
    expect(r.filter).toContain("overlay=x=0:y=656[vout]");
    expect(shortsFromLandscape("a", "b", { placement: "top" }).picture.y).toBe(160 + 115);
    expect(describeApi().categories).toContain("economy");
  });
});
