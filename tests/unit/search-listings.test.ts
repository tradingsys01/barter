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

  it("escapes percent and underscore for ilike", () => {
    expect(buildSearchFilter({ q: "50% off_now" })).toEqual({ q: "50\\% off\\_now" });
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
});
