"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { createReportSchema } from "@/lib/reports/validation";

export async function createReport(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = createReportSchema.parse({
    target_type: formData.get("target_type"),
    target_id: formData.get("target_id"),
    reason: formData.get("reason"),
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from("reports")
    .insert({
      reporter_id: user.id,
      target_type: parsed.target_type,
      target_id: parsed.target_id,
      reason: parsed.reason,
    });
  if (error) throw new Error(error.message);
}
