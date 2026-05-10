import { describe, expect, it } from "vitest";
import { buildSearchFilter } from "@/lib/listings/search";

describe("buildSearchFilter", () => {
  it("returns the empty filter for empty input", () => {
    expect(buildSearchFilter({})).toEqual({});
  });

  it("trims and lowercases q; rejects q < 2 chars", () => {
    expect(buildSearchFilter({ q: " A " })).toEqual({});
    expect(buildSearchFilter({ q: " Apples " })).toEqual({ q: "apples" });
  });

  it("passes punctuation through unchanged (websearch handles it)", () => {
    expect(buildSearchFilter({ q: '"exact phrase" -broken' })).toEqual({
      q: '"exact phrase" -broken',
    });
    expect(buildSearchFilter({ q: "50% off_now" })).toEqual({ q: "50% off_now" });
  });

  it("passes through category and area slugs unchanged", () => {
    expect(buildSearchFilter({ categorySlug: "food", areaSlug: "heriot-bay" })).toEqual({
      categorySlug: "food",
      areaSlug: "heriot-bay",
    });
  });

  it("ignores empty or whitespace-only slugs", () => {
    expect(buildSearchFilter({ categorySlug: "", areaSlug: "   " })).toEqual({});
  });

  it("accepts type='want' and drops unknown type values", () => {
    expect(buildSearchFilter({ type: "want" })).toEqual({ type: "want" });
    expect(buildSearchFilter({ type: "offer" as any })).toEqual({});
    expect(buildSearchFilter({ type: "" as any })).toEqual({});
  });
});
