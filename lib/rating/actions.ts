"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { rateTradeSchema } from "@/lib/rating/validation";

export async function rateTrade(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = rateTradeSchema.parse({
    trade_id: formData.get("trade_id"),
    stars: Number(formData.get("stars")),
    comment: formData.get("comment") || undefined,
  });

  const supabase = await createClient();
  const { data: trade, error: gerr } = await supabase
    .from("trades")
    .select("id, chat_id, party_a, party_b, status")
    .eq("id", parsed.trade_id)
    .maybeSingle();
  if (gerr) throw new Error(gerr.message);
  if (!trade) throw new Error("Trade not found");
  if (trade.status !== "completed") throw new Error("Trade is not completed");
  if (user.id !== trade.party_a && user.id !== trade.party_b) throw new Error("Not a party");

  const ratee = user.id === trade.party_a ? trade.party_b : trade.party_a;

  const { error } = await supabase.from("ratings").insert({
    trade_id: parsed.trade_id,
    rater_id: user.id,
    ratee_id: ratee,
    stars: parsed.stars,
    comment: parsed.comment ?? null,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/chats/${trade.chat_id}`);
}
