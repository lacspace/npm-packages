import { describe, expect, it } from "vitest";
import { describe as describeApi, moderate } from "./index.js";

describe("moderate", () => {
  it("allows a normal comment", () => {
    const r = moderate("Great coverage, thank you for the update!");
    expect(r.action).toBe("allow");
    expect(r.score).toBeLessThan(0.4);
  });

  it("flags/hides promotional spam", () => {
    const r = moderate("Buy now! Huge discount, guaranteed return on your investment!");
    expect(["flag", "hide"]).toContain(r.action);
    expect(r.categories.spam).toBeGreaterThan(0.5);
  });

  it("detects link-spam with a shortener", () => {
    const r = moderate("Join telegram group here bit.ly/xyz and subscribe my channel");
    expect(r.categories.linkspam).toBeGreaterThan(0.6);
    expect(r.pii.urls.some((u) => /bit\.ly/.test(u))).toBe(true);
  });

  it("detects doxxing via a Nepali phone number", () => {
    const r = moderate("his number is 9812345678 everyone call him");
    expect(r.categories.doxxing).toBeGreaterThan(0.6);
    expect(r.pii.phones).toContain("9812345678");
    expect(["flag", "hide"]).toContain(r.action);
  });

  it("catches romanized + Devanagari abuse", () => {
    expect(moderate("tero kura bekar cha murkha").categories.abuse).toBeGreaterThan(0.4);
    expect(moderate("तँ त मूर्ख होस्").categories.abuse).toBeGreaterThan(0.4);
  });

  it("marks gray-zone comments borderline for an AI second opinion", () => {
    const r = moderate("this is kind of nonsense honestly");
    expect(r.borderline).toBe(true);
  });

  it("extends lexicons via options", () => {
    const base = moderate("यो त फट्यांग्रा हो");
    expect(base.categories.abuse).toBe(0);
    const ext = moderate("यो त फट्यांग्रा हो", { lexicons: { abuse: ["फट्यांग्रा"] } });
    expect(ext.categories.abuse).toBeGreaterThan(0.4);
  });

  it("suggests an FAQ reply only for clean comments", () => {
    const faqs = [{ match: ["kaha", "कहाँ", "where"], reply: { en: "Full story at the link in bio.", ne: "पूरा समाचार बायोको लिंकमा।" } }];
    const clean = moderate("where can I read the full story?", { faqs });
    expect(clean.suggestedReply).toContain("link in bio");
    const spammy = moderate("where is the discount buy now lottery winner", { faqs });
    expect(spammy.suggestedReply).toBeUndefined(); // not rewarded
  });

  it("describe() lists categories and actions", () => {
    const d = describeApi();
    expect(d.categories).toContain("doxxing");
    expect(d.actions).toContain("hide");
  });
});
