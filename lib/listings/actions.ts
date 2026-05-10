"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { createListingSchema, editListingSchema } from "@/lib/listings/validation";
import { buildListingRow, validateImageFiles, fileExt, MAX_IMAGES } from "@/lib/listings/internal";
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
  };
  const parsed = editListingSchema.parse(raw);
  const supabase = await createClient();
  const { id, ...patch } = parsed;
  const update: Record<string, unknown> = { ...patch };
  if (patch.title) update.slug = slugify(patch.title);

  const { data, error } = await supabase
    .from("listings")
    .update(update)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id, slug")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not update listing");

  // Handle new photo uploads
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > 0) {
    validateImageFiles(files);
    // Check total image count (existing + new)
    const { data: existingImages, count } = await supabase
      .from("listing_images")
      .select("sort_order", { count: "exact" })
      .eq("listing_id", id)
      .order("sort_order", { ascending: false });
    const existingCount = count ?? 0;
    if (existingCount + files.length > MAX_IMAGES) {
      throw new Error(`You can have at most ${MAX_IMAGES} photos. You have ${existingCount}, trying to add ${files.length}.`);
    }
    const startOrder = (existingImages?.[0]?.sort_order ?? -1) + 1;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const path = `${id}/${startOrder + i}.${fileExt(file.name)}`;
      const { error: upErr } = await supabase.storage.from("listings").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (upErr) throw new Error(`Upload failed for ${file.name}: ${upErr.message}`);

      const { error: imgErr } = await supabase.from("listing_images").insert({
        listing_id: id,
        path,
        sort_order: startOrder + i,
      });
      if (imgErr) throw new Error(imgErr.message);
    }
  }

  redirect(`/l/${data.id}/${data.slug}`);
}

export async function deleteListingImage(formData: FormData): Promise<void> {
  const user = await requireUser();
  const imageId = String(formData.get("image_id") ?? "");
  const listingId = String(formData.get("listing_id") ?? "");
  if (!imageId || !listingId) throw new Error("Missing image or listing id");

  const supabase = await createClient();

  // Verify ownership
  const { data: listing } = await supabase
    .from("listings")
    .select("id")
    .eq("id", listingId)
    .eq("owner_id", user.id)
    .single();
  if (!listing) throw new Error("Not authorized");

  // Get image path before deleting
  const { data: image } = await supabase
    .from("listing_images")
    .select("path")
    .eq("id", imageId)
    .eq("listing_id", listingId)
    .single();
  if (!image) throw new Error("Image not found");

  // Delete from storage
  await supabase.storage.from("listings").remove([image.path]);

  // Delete from database
  const { error } = await supabase
    .from("listing_images")
    .delete()
    .eq("id", imageId)
    .eq("listing_id", listingId);
  if (error) throw new Error(error.message);

  redirect(`/me/listings/${listingId}/edit`);
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

export async function extendListing(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing listing id");
  const supabase = await createClient();
  const { error } = await supabase
    .from("listings")
    .update({ expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() })
    .eq("id", id)
    .eq("owner_id", user.id)
    .eq("status", "active");
  if (error) throw new Error(error.message);
  redirect("/me/listings");
}
