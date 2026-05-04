"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { sendMessageSchema } from "@/lib/chat/validation";

/**
 * Open (or reopen) a chat between the current user and the listing owner.
 * Returns by redirecting to /chats/[chat_id].
 *
 * Idempotent: if a chat already exists for (listing, initiator), redirect to it
 * instead of creating a duplicate.
 */
export async function startChat(formData: FormData): Promise<void> {
  const user = await requireUser();
  const listingId = String(formData.get("listing_id") ?? "");
  if (!listingId) throw new Error("Missing listing_id");

  const supabase = await createClient();

  const { data: listing, error: lerr } = await supabase
    .from("listings")
    .select("id, owner_id, title, status, public_users!owner_id ( display_name )")
    .eq("id", listingId)
    .maybeSingle();
  if (lerr) throw new Error(lerr.message);
  if (!listing) throw new Error("Listing not found");
  if (listing.status !== "active") throw new Error("This listing is not accepting offers");
  if (listing.owner_id === user.id) throw new Error("You cannot chat with yourself");

  // Already have a chat? Use it.
  const { data: existing } = await supabase
    .from("chats")
    .select("id")
    .eq("listing_id", listingId)
    .eq("initiator_id", user.id)
    .maybeSingle();

  if (existing) redirect(`/chats/${existing.id}`);

  const { data: chat, error: cerr } = await supabase
    .from("chats")
    .insert({
      listing_id: listingId,
      initiator_id: user.id,
      owner_id: listing.owner_id,
    })
    .select("id")
    .single();
  if (cerr || !chat) throw new Error(cerr?.message ?? "Could not start chat");

  const ownerName = (listing as any).public_users?.display_name ?? "there";
  const greeting = `Hi ${ownerName}, I'd like to swap for your listing "${listing.title}".`;
  const { error: merr } = await supabase
    .from("messages")
    .insert({ chat_id: chat.id, sender_id: user.id, body: greeting });
  if (merr) throw new Error(merr.message);

  redirect(`/chats/${chat.id}`);
}

export async function sendMessage(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = sendMessageSchema.parse({
    chat_id: formData.get("chat_id"),
    body: formData.get("body"),
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from("messages")
    .insert({ chat_id: parsed.chat_id, sender_id: user.id, body: parsed.body });
  if (error) throw new Error(error.message);

  revalidatePath(`/chats/${parsed.chat_id}`);
  revalidatePath("/chats");
}
