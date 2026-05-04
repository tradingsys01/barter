// lib/users/queries.ts
import { createClient } from "@/lib/supabase/server";

export type PublicUser = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  area_id: string | null;
  area_name: string | null;
  created_at: string;
};

export async function getPublicUser(id: string): Promise<PublicUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("public_users")
    .select(`
      id, display_name, avatar_url, bio, area_id, created_at,
      areas:area_id ( name )
    `)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    display_name: data.display_name,
    avatar_url: data.avatar_url,
    bio: data.bio,
    area_id: data.area_id,
    area_name: (data as any).areas?.name ?? null,
    created_at: data.created_at,
  };
}
