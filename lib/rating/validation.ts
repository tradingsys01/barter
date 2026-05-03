import { z } from "zod";

export const rateTradeSchema = z.object({
  trade_id: z.string().uuid(),
  stars: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});

export type RateTradeInput = z.infer<typeof rateTradeSchema>;
