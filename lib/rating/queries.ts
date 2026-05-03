import { createClient } from "@/lib/supabase/server";

export type RatingSummary = { avg: number; count: number };

export async function getRatingSummary(userId: string): Promise<RatingSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ratings")
    .select("stars")
    .eq("ratee_id", userId);
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return { avg: 0, count: 0 };
  const sum = rows.reduce((acc, r: any) => acc + r.stars, 0);
  return { avg: sum / rows.length, count: rows.length };
}

export async function myRatingForTrade(
  tradeId: string,
  raterId: string,
): Promise<{ stars: number; comment: string | null } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ratings")
    .select("stars, comment")
    .eq("trade_id", tradeId)
    .eq("rater_id", raterId)
    .maybeSingle();
  if (error) throw error;
  return data ? { stars: data.stars, comment: data.comment } : null;
}
