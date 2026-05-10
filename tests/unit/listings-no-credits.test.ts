import { describe, expect, it } from "vitest";
import { createListingSchema } from "@/lib/listings/validation";
import { buildListingRow } from "@/lib/listings/internal";

// See docs/superpowers/specs/2026-05-09-remove-community-credits-design.md
// for why community credits were removed. This file exists as a regression
// guard. If you are tempted to re-add the field to satisfy this test,
// re-read the spec first.

const validInput = {
  type: "offer" as const,
  title: "Two ripe apples",
  category_id: "11111111-1111-1111-1111-111111111111",
  area_id:     "22222222-2222-2222-2222-222222222222",
  wants_text: "Eggs or jam",
};

describe("community credits removed", () => {
  it("createListingSchema parses input that omits accepts_credits", () => {
    const r = createListingSchema.safeParse(validInput);
    expect(r.success).toBe(true);
  });

  it("createListingSchema does not emit an accepts_credits field", () => {
    const parsed = createListingSchema.parse(validInput);
    expect("accepts_credits" in parsed).toBe(false);
  });

  it("buildListingRow output does not include accepts_credits", () => {
    const parsed = createListingSchema.parse(validInput);
    const row = buildListingRow(parsed, "owner-uuid");
    expect("accepts_credits" in row).toBe(false);
  });
});
