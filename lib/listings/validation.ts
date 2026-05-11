import { z } from "zod";

export const LISTING_TYPES = ["offer", "want"] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

export const createListingSchema = z.object({
  type: z.enum(LISTING_TYPES),
  title: z.string().trim().min(3, "Title is too short").max(120, "Title is too long"),
  description: z.string().trim().max(2000).optional(),
  category_id: z.string().uuid(),
  area_id: z.string().uuid(),
  wants_text: z.string().trim().max(500).optional(),
});

export type CreateListingInput = z.infer<typeof createListingSchema>;

export const rideFieldsSchema = z.object({
  route_from: z.string().min(1, "From location is required"),
  route_to: z.string().min(1, "To location is required"),
  schedule: z.string().trim().min(1, "Schedule is required").max(200),
  seats: z.coerce.number().int().min(1, "At least 1 seat").max(6, "At most 6 seats"),
  gas_share: z.coerce.boolean().default(false),
});

export const createRideListingSchema = createListingSchema.merge(rideFieldsSchema);

export type CreateRideListingInput = z.infer<typeof createRideListingSchema>;

export const editListingSchema = createListingSchema.partial().extend({
  id: z.string().uuid(),
});

export const editRideListingSchema = editListingSchema.merge(rideFieldsSchema.partial());

export type EditListingInput = z.infer<typeof editListingSchema>;
export type EditRideListingInput = z.infer<typeof editRideListingSchema>;
