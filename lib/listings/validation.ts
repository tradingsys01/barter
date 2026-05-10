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

export const editListingSchema = createListingSchema.partial().extend({
  id: z.string().uuid(),
});

export type EditListingInput = z.infer<typeof editListingSchema>;
