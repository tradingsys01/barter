import { createClient as createServiceClient } from "@supabase/supabase-js";

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export type ReportRow = {
  id: string;
  reporter_id: string;
  reporter_name: string | null;
  target_type: "listing" | "user" | "message";
  target_id: string;
  reason: string;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
};

export async function listOpenReports(): Promise<ReportRow[]> {
  const supabase = admin();
  const { data, error } = await supabase
    .from("reports")
    .select(`
      id, reporter_id, target_type, target_id, reason, status, created_at,
      reporter:reporter_id ( display_name )
    `)
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    reporter_id: r.reporter_id,
    reporter_name: r.reporter?.display_name ?? null,
    target_type: r.target_type,
    target_id: r.target_id,
    reason: r.reason,
    status: r.status,
    created_at: r.created_at,
  }));
}
