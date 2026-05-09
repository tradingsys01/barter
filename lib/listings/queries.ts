import { createClient } from "@/lib/supabase/server";

export type FeedItem = {
  id: string;
  slug: string;
  title: string;
  type: "offer_goods" | "offer_service" | "want";
  status: "active" | "reserved" | "completed" | "archived";
  area_name: string | null;
  category_name: string | null;
  cover_path: string | null;
  created_at: string;
};

const FEED_SELECT = `
  id, slug, title, type, status, created_at,
  areas:area_id ( name ),
  categories:category_id ( name ),
  listing_images ( path, sort_order )
`;

function shapeFeedRow(r: any): FeedItem {
  const cover = (r.listing_images ?? [])
    .slice()
    .sort((a: any, b: any) => a.sort_order - b.sort_order)[0]?.path ?? null;
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    type: r.type,
    status: r.status,
    area_name: r.areas?.name ?? null,
    category_name: r.categories?.name ?? null,
    cover_path: cover,
    created_at: r.created_at,
  };
}

export async function listFeed(limit = 30): Promise<FeedItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .select(FEED_SELECT)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(shapeFeedRow);
}

export async function listByCategory(slug: string, limit = 60): Promise<FeedItem[]> {
  const supabase = await createClient();
  const { data: cat } = await supabase.from("categories").select("id, name").eq("slug", slug).maybeSingle();
  if (!cat) return [];
  const { data, error } = await supabase
    .from("listings")
    .select(FEED_SELECT)
    .eq("status", "active")
    .eq("category_id", cat.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(shapeFeedRow);
}

export async function listByArea(slug: string, limit = 60): Promise<FeedItem[]> {
  const supabase = await createClient();
  const { data: area } = await supabase.from("areas").select("id, name").eq("slug", slug).maybeSingle();
  if (!area) return [];
  const { data, error } = await supabase
    .from("listings")
    .select(FEED_SELECT)
    .eq("status", "active")
    .eq("area_id", area.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(shapeFeedRow);
}

export type ListingDetail = FeedItem & {
  description: string | null;
  wants_text: string | null;
  owner: { id: string; display_name: string | null };
  images: { path: string; alt_text: string | null; sort_order: number }[];
};

export async function getListing(id: string): Promise<ListingDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .select(`
      id, slug, title, type, status, description, wants_text, created_at,
      areas:area_id ( name ),
      categories:category_id ( name ),
      owner_id,
      public_users!owner_id ( id, display_name ),
      listing_images ( path, alt_text, sort_order )
    `)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const images = (data.listing_images ?? []).slice().sort((a: any, b: any) => a.sort_order - b.sort_order);
  return {
    id: data.id,
    slug: data.slug,
    title: data.title,
    type: data.type,
    status: (data as any).status,
    description: data.description,
    wants_text: data.wants_text,
    area_name: (data as any).areas?.name ?? null,
    category_name: (data as any).categories?.name ?? null,
    cover_path: images[0]?.path ?? null,
    created_at: data.created_at,
    owner: {
      id: (data as any).owner_id,
      display_name: (data as any).public_users?.display_name ?? null,
    },
    images,
  };
}

export async function listMyListings(userId: string): Promise<FeedItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .select(FEED_SELECT)
    .eq("owner_id", userId)
    .neq("status", "archived")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(shapeFeedRow);
}
