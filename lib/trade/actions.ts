"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";

async function partyOf(chatId: string, userId: string) {
  const supabase = await createClient();
  const { data: chat, error } = await supabase
    .from("chats")
    .select("id, listing_id, initiator_id, owner_id")
    .eq("id", chatId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!chat) throw new Error("Chat not found");
  const isParty = userId === chat.initiator_id || userId === chat.owner_id;
  if (!isParty) throw new Error("Not a party of this chat");
  const otherId = userId === chat.initiator_id ? chat.owner_id : chat.initiator_id;
  return { chat, otherId };
}

export async function markTradeDone(formData: FormData): Promise<void> {
  const user = await requireUser();
  const chatId = String(formData.get("chat_id") ?? "");
  if (!chatId) throw new Error("Missing chat_id");

  const supabase = await createClient();
  const { chat, otherId } = await partyOf(chatId, user.id);

  // Idempotent: pending trade already exists?
  const { data: existing } = await supabase
    .from("trades")
    .select("id")
    .eq("chat_id", chatId)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    revalidatePath(`/chats/${chatId}`);
    return;
  }

  const { error } = await supabase
    .from("trades")
    .insert({
      chat_id: chatId,
      listing_id: chat.listing_id,
      party_a: user.id,
      party_b: otherId,
      status: "pending",
    });
  if (error && error.code !== "23505") throw new Error(error.message);
  // 23505 = unique_violation; partial index trades_one_pending_per_chat caught
  // a concurrent insert. Treat as success — the pending trade now exists.

  revalidatePath(`/chats/${chatId}`);
}

export async function confirmTrade(formData: FormData): Promise<void> {
  const user = await requireUser();
  const tradeId = String(formData.get("trade_id") ?? "");
  if (!tradeId) throw new Error("Missing trade_id");

  const supabase = await createClient();
  const { data: trade, error: gerr } = await supabase
    .from("trades")
    .select("id, chat_id, party_a, party_b, status")
    .eq("id", tradeId)
    .maybeSingle();
  if (gerr) throw new Error(gerr.message);
  if (!trade) throw new Error("Trade not found");
  if (trade.status !== "pending") throw new Error("Trade is not pending");
  if (user.id !== trade.party_b) throw new Error("Only the other party can confirm");

  const { error } = await supabase
    .from("trades")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", tradeId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);

  revalidatePath(`/chats/${trade.chat_id}`);
}

export async function cancelTrade(formData: FormData): Promise<void> {
  const user = await requireUser();
  const tradeId = String(formData.get("trade_id") ?? "");
  if (!tradeId) throw new Error("Missing trade_id");

  const supabase = await createClient();
  const { data: trade, error: gerr } = await supabase
    .from("trades")
    .select("id, chat_id, party_a, party_b, status")
    .eq("id", tradeId)
    .maybeSingle();
  if (gerr) throw new Error(gerr.message);
  if (!trade) throw new Error("Trade not found");
  if (trade.status !== "pending") throw new Error("Trade is not pending");
  if (user.id !== trade.party_a && user.id !== trade.party_b) {
    throw new Error("Not a party");
  }

  const { error } = await supabase
    .from("trades")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", tradeId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);

  revalidatePath(`/chats/${trade.chat_id}`);
}
