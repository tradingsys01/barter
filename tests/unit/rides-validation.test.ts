import { describe, expect, it } from "vitest";
import { createListingSchema, createRideListingSchema } from "@/lib/listings/validation";

const validRide = {
  type: "offer" as const,
  title: "Ride: Bold Point ↔ Ferry",
  description: "Daily commute, happy to help neighbours",
  category_id: "11111111-1111-1111-1111-111111111111",
  area_id: "22222222-2222-2222-2222-222222222222",
  wants_text: "Gas share or barter",
  route_from: "bold-point",
  route_to: "quathiaski-cove",
  schedule: "Mon-Fri 7am out, 4pm return",
  seats: 3,
  gas_share: true,
};

describe("createRideListingSchema", () => {
  it("accepts valid ride input", () => {
    const r = createRideListingSchema.safeParse(validRide);
    expect(r.success).toBe(true);
  });

  it("requires route_from", () => {
    const r = createRideListingSchema.safeParse({ ...validRide, route_from: undefined });
    expect(r.success).toBe(false);
  });

  it("requires route_to", () => {
    const r = createRideListingSchema.safeParse({ ...validRide, route_to: undefined });
    expect(r.success).toBe(false);
  });

  it("requires schedule", () => {
    const r = createRideListingSchema.safeParse({ ...validRide, schedule: undefined });
    expect(r.success).toBe(false);
  });

  it("requires seats between 1 and 6", () => {
    const zero = createRideListingSchema.safeParse({ ...validRide, seats: 0 });
    expect(zero.success).toBe(false);

    const seven = createRideListingSchema.safeParse({ ...validRide, seats: 7 });
    expect(seven.success).toBe(false);

    const valid = createRideListingSchema.safeParse({ ...validRide, seats: 4 });
    expect(valid.success).toBe(true);
  });

  it("gas_share defaults to false", () => {
    const r = createRideListingSchema.safeParse({ ...validRide, gas_share: undefined });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.gas_share).toBe(false);
  });
});
