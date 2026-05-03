"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { createListingSchema, editListingSchema } from "@/lib/listings/validation";
import { buildListingRow, validateImageFiles, fileExt } from "@/lib/listings/internal";
import { slugify } from "@/lib/slug";

export async function createListing(form: FormData): Promise<void> {
  const user = await requireUser();

  const raw = {
    type: form.get("type"),
    title: form.get("title"),
    description: form.get("description") || undefined,
    category_id: form.get("category_id"),
    area_id: form.get("area_id"),
    wants_text: form.get("wants_text") || undefined,
    accepts_credits: form.get("accepts_credits") === "on",
  };
  const parsed = createListingSchema.parse(raw);

  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  validateImageFiles(files);

  const supabase = await createClient();
  const row = buildListingRow(parsed, user.id);

  const { data: listing, error: insertErr } = await supabase
    .from("listings")
    .insert(row)
    .select("id, slug")
    .single();
  if (insertErr || !listing) throw new Error(insertErr?.message ?? "Could not create listing");

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const path = `${listing.id}/${i}.${fileExt(file.name)}`;
    const { error: upErr } = await supabase.storage.from("listings").upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (upErr) throw new Error(`Upload failed for ${file.name}: ${upErr.message}`);

    const { error: imgErr } = await supabase.from("listing_images").insert({
      listing_id: listing.id,
      path,
      sort_order: i,
    });
    if (imgErr) throw new Error(imgErr.message);
  }

  redirect(`/l/${listing.id}/${listing.slug}`);
}

export async function editListing(form: FormData): Promise<void> {
  const user = await requireUser();
  const raw = {
    id: form.get("id"),
    type: form.get("type") || undefined,
    title: form.get("title") || undefined,
    description: form.get("description") || undefined,
    category_id: form.get("category_id") || undefined,
    area_id: form.get("area_id") || undefined,
    wants_text: form.get("wants_text") || undefined,
    accepts_credits: form.get("accepts_credits") === "on",
  };
  const parsed = editListingSchema.parse(raw);
  const supabase = await createClient();
  const { id, ...patch } = parsed;
  const update: Record<string, unknown> = { ...patch };
  if (patch.title) update.slug = slugify(patch.title);

  const { error } = await supabase
    .from("listings")
    .update(update)
    .eq("id", id)
    .eq("owner_id", user.id);
  if (error) throw new Error(error.message);

  redirect(`/l/${id}/${update.slug ?? ""}`);
}

export async function archiveListing(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing listing id");
  const supabase = await createClient();
  const { error } = await supabase
    .from("listings")
    .update({ status: "archived" })
    .eq("id", id)
    .eq("owner_id", user.id);
  if (error) throw new Error(error.message);
  redirect("/me/listings");
}
