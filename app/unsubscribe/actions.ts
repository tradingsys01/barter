"use server";

import { createClient } from "@supabase/supabase-js";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe-token";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function setChatEmailPreference(
  token: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; reason: "invalid_token" }> {
  const userId = verifyUnsubscribeToken(token, "chat_email");
  if (!userId) return { ok: false, reason: "invalid_token" };
  await admin()
    .from("users")
    .update({ notify_chat_email: enabled })
    .eq("id", userId);
  return { ok: true };
}
