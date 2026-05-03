import { createClient } from "@/lib/supabase/server";

export type Trade = {
  id: string;
  chat_id: string;
  listing_id: string;
  party_a: string;
  party_b: string;
  status: "pending" | "completed" | "cancelled";
  created_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
};

export async function getActiveTradeForChat(chatId: string): Promise<Trade | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .eq("chat_id", chatId)
    .eq("status", "pending")
    .maybeSingle();
  if (error) throw error;
  return (data as Trade) ?? null;
}

export async function getCompletedTradesForChat(chatId: string): Promise<Trade[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .eq("chat_id", chatId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Trade[];
}
