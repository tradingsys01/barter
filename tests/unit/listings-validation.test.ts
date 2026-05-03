import { describe, expect, it } from "vitest";
import { createListingSchema } from "@/lib/listings/validation";

const valid = {
  type: "offer_goods" as const,
  title: "Two ripe apples",
  description: "From our backyard tree",
  category_id: "11111111-1111-1111-1111-111111111111",
  area_id:     "22222222-2222-2222-2222-222222222222",
  wants_text: "Eggs or jam",
  accepts_credits: false,
};

describe("createListingSchema", () => {
  it("accepts valid input", () => {
    const r = createListingSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("rejects too-short title", () => {
    const r = createListingSchema.safeParse({ ...valid, title: "ab" });
    expect(r.success).toBe(false);
  });

  it("rejects too-long title", () => {
    const r = createListingSchema.safeParse({ ...valid, title: "x".repeat(121) });
    expect(r.success).toBe(false);
  });

  it("rejects unknown listing type", () => {
    const r = createListingSchema.safeParse({ ...valid, type: "barter" });
    expect(r.success).toBe(false);
  });

  it("requires category_id and area_id as uuids", () => {
    const r = createListingSchema.safeParse({ ...valid, category_id: "nope" });
    expect(r.success).toBe(false);
  });

  it("trims title whitespace", () => {
    const r = createListingSchema.safeParse({ ...valid, title: "   Apples   " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.title).toBe("Apples");
  });

  it("description is optional, max 2000", () => {
    const without = createListingSchema.safeParse({ ...valid, description: undefined });
    expect(without.success).toBe(true);
    const tooLong = createListingSchema.safeParse({ ...valid, description: "x".repeat(2001) });
    expect(tooLong.success).toBe(false);
  });
});
