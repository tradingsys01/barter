import { describe, expect, it } from "vitest";
import { rateTradeSchema } from "@/lib/rating/validation";

const validBase = {
  trade_id: "11111111-1111-1111-1111-111111111111",
  stars: 5,
  comment: "Easy swap, friendly.",
};

describe("rateTradeSchema", () => {
  it("accepts valid rating", () => {
    expect(rateTradeSchema.safeParse(validBase).success).toBe(true);
  });

  it("accepts no comment", () => {
    expect(rateTradeSchema.safeParse({ ...validBase, comment: undefined }).success).toBe(true);
  });

  it("rejects stars below 1", () => {
    expect(rateTradeSchema.safeParse({ ...validBase, stars: 0 }).success).toBe(false);
  });

  it("rejects stars above 5", () => {
    expect(rateTradeSchema.safeParse({ ...validBase, stars: 6 }).success).toBe(false);
  });

  it("rejects non-integer stars", () => {
    expect(rateTradeSchema.safeParse({ ...validBase, stars: 4.5 }).success).toBe(false);
  });

  it("rejects comment over 500 chars", () => {
    expect(rateTradeSchema.safeParse({ ...validBase, comment: "x".repeat(501) }).success).toBe(false);
  });

  it("rejects bad uuid", () => {
    expect(rateTradeSchema.safeParse({ ...validBase, trade_id: "nope" }).success).toBe(false);
  });
});
