"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { createListingSchema } from "@/lib/listings/validation";
import { buildListingRow, validateImageFiles, fileExt } from "@/lib/listings/internal";

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
