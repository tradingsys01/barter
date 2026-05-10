"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { z } from "zod";

const feedbackSchema = z.object({
  type: z.enum(["bug", "suggestion", "other"]),
  email: z.string().email().optional().or(z.literal("")),
  message: z.string().min(10, "Please provide more detail").max(2000),
});

export async function submitFeedback(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const raw = {
    type: formData.get("type"),
    email: formData.get("email") || undefined,
    message: formData.get("message"),
  };

  const parsed = feedbackSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const user = await getSessionUser();
  const supabase = await createClient();

  const { error } = await supabase.from("feedback").insert({
    user_id: user?.id ?? null,
    email: parsed.data.email || (user?.email ?? null),
    type: parsed.data.type,
    message: parsed.data.message,
  });

  if (error) {
    return { success: false, error: "Failed to submit feedback. Please try again." };
  }

  return { success: true };
}
