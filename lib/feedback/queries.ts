import { createClient as createServiceClient } from "@supabase/supabase-js";

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export type FeedbackRow = {
  id: string;
  user_id: string | null;
  email: string | null;
  type: "bug" | "suggestion" | "other";
  message: string;
  created_at: string;
};

export async function listFeedback(): Promise<FeedbackRow[]> {
  const supabase = admin();
  const { data, error } = await supabase
    .from("feedback")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}
