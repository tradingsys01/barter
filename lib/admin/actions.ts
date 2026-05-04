"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/auth";

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function resolveReport(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing report id");
  const supabase = admin();
  const { error } = await supabase
    .from("reports")
    .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: me.id })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/reports");
}

export async function dismissReport(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing report id");
  const supabase = admin();
  const { error } = await supabase
    .from("reports")
    .update({ status: "dismissed", resolved_at: new Date().toISOString(), resolved_by: me.id })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/reports");
}

export async function hideListing(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("listing_id") ?? "");
  if (!id) throw new Error("Missing listing_id");
  const supabase = admin();
  const { error } = await supabase
    .from("listings")
    .update({ status: "archived" })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/reports");
  revalidatePath("/");
}

export async function banUser(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("user_id") ?? "");
  if (!id) throw new Error("Missing user_id");
  const supabase = admin();
  const { error } = await supabase
    .from("users")
    .update({ banned_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/reports");
}
