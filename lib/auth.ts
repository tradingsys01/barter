import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getSessionUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/signin");
  return user;
}

/**
 * Core implementation — accepts any Supabase client so it can be called
 * from both production code (server client) and unit tests (direct client).
 */
export async function getProfileWithClient(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("users")
    .select("id, display_name, area_id")
    .eq("id", userId)
    .maybeSingle();
  return data;
}

/**
 * Convenience wrapper that builds its own server client.
 * Use this in RSCs and route handlers; use getProfileWithClient in tests.
 */
export async function getProfile(userId: string) {
  const supabase = await createClient();
  return getProfileWithClient(supabase, userId);
}

export async function requireCompleteProfile() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  if (!profile?.display_name || !profile.area_id) {
    redirect("/onboarding");
  }
  return { user, profile };
}
