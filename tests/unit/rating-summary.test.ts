import { describe, expect, it } from "vitest";
import { formatRatingSummary } from "@/components/chat/rating-summary";

describe("formatRatingSummary", () => {
  it("shows nothing for zero ratings", () => {
    expect(formatRatingSummary({ avg: 0, count: 0 })).toBe(null);
  });

  it("rounds to one decimal", () => {
    expect(formatRatingSummary({ avg: 4.27, count: 11 })).toBe("★ 4.3 · 11 reviews");
  });

  it("singular review", () => {
    expect(formatRatingSummary({ avg: 5, count: 1 })).toBe("★ 5.0 · 1 review");
  });
});
