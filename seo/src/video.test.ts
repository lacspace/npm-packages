import { describe, expect, it } from "vitest";

describe("videoObject durationSec / inLanguage (1.10.0)", () => {
  it("converts seconds to an ISO duration and keeps an explicit duration", async () => {
    const { videoObject, isoDuration } = await import("./index");
    expect(isoDuration(0)).toBe("PT0S");
    expect(isoDuration(65)).toBe("PT1M5S");
    expect(isoDuration(3600)).toBe("PT1H");
    expect(isoDuration(3725.4)).toBe("PT1H2M5S");
    expect(isoDuration(-1)).toBeUndefined();
    const v = videoObject({ name: "RSI", description: "d", thumbnailUrl: "https://x/t.jpg", uploadDate: "2026-10-07", durationSec: 245, inLanguage: "ne" });
    expect(v).toMatchObject({ duration: "PT4M5S", inLanguage: "ne" });
    expect(videoObject({ name: "a", description: "d", thumbnailUrl: "t", uploadDate: "2026-10-07", duration: "PT9S", durationSec: 1 }).duration).toBe("PT9S");
  });
});
