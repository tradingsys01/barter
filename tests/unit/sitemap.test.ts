import { describe, expect, it } from "vitest";
import { buildSitemapEntries, type SitemapInputs } from "@/app/sitemap";

const fixture: SitemapInputs = {
  origin: "https://quadrabarter.ca",
  listings: [
    { id: "11111111-1111-1111-1111-111111111111", slug: "apples", updated_at: "2026-05-01T00:00:00Z" },
  ],
  categories: [{ slug: "food" }],
  areas: [{ slug: "quathiaski-cove" }],
};

describe("buildSitemapEntries", () => {
  it("includes the home + static pages", () => {
    const entries = buildSitemapEntries(fixture);
    expect(entries.find((e) => e.url === "https://quadrabarter.ca")).toBeTruthy();
  });

  it("includes one URL per listing", () => {
    const entries = buildSitemapEntries(fixture);
    const u = "https://quadrabarter.ca/l/11111111-1111-1111-1111-111111111111/apples";
    const e = entries.find((x) => x.url === u);
    expect(e).toBeTruthy();
    expect(e?.lastModified).toEqual(new Date("2026-05-01T00:00:00Z"));
  });

  it("includes a URL per category and area", () => {
    const entries = buildSitemapEntries(fixture);
    expect(entries.find((e) => e.url === "https://quadrabarter.ca/c/food")).toBeTruthy();
    expect(entries.find((e) => e.url === "https://quadrabarter.ca/area/quathiaski-cove")).toBeTruthy();
  });

  it("never returns duplicate urls", () => {
    const entries = buildSitemapEntries(fixture);
    const urls = entries.map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
