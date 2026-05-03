import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

export async function getProfile(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("id, display_name, area_id")
    .eq("id", userId)
    .maybeSingle();
  return data;
}

export async function requireCompleteProfile() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  if (!profile?.display_name || !profile.area_id) {
    redirect("/onboarding");
  }
  return { user, profile };
}
