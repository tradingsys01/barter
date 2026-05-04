import { z } from "zod";

export const REPORT_TARGETS = ["listing", "user", "message"] as const;

export const createReportSchema = z.object({
  target_type: z.enum(REPORT_TARGETS),
  target_id: z.string().uuid(),
  reason: z.string().trim().min(3, "Tell us a bit more").max(1000, "Reason is too long"),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
