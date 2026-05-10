import { createClient } from "@/lib/supabase/server";
import type { FeedItem } from "@/lib/listings/queries";

export type SearchInput = {
  q?: string;
  categorySlug?: string;
  areaSlug?: string;
  /** Filter by listing type. Currently only "want" is exposed in the UI. */
  type?: "want";
  limit?: number;
};

export type SearchFilter = {
  q?: string;
  categorySlug?: string;
  areaSlug?: string;
  type?: "want";
};

/**
 * Pure: normalize search params. Trims, lowercases, drops too-short
 * queries, drops empty slugs. The q is fed to PostgREST .textSearch with
 * the websearch parser, which safely handles arbitrary user input
 * (quotes, dashes, "or"), so no escaping is needed here.
 */
export function buildSearchFilter(input: SearchInput): SearchFilter {
  const out: SearchFilter = {};
  if (input.q != null) {
    const trimmed = input.q.trim().toLowerCase();
    if (trimmed.length >= 2) {
      out.q = trimmed;
    }
  }
  if (input.categorySlug && input.categorySlug.trim()) {
    const slug = input.categorySlug.trim();
    if (slug === "wanted") {
      out.type = "want";
    } else {
      out.categorySlug = slug;
    }
  }
  if (input.areaSlug && input.areaSlug.trim()) {
    out.areaSlug = input.areaSlug.trim();
  }
  if (input.type === "want") {
    out.type = "want";
  }
  return out;
}

export async function searchListings(input: SearchInput): Promise<FeedItem[]> {
  const filter = buildSearchFilter(input);
  const supabase = await createClient();

  // Resolve slugs to ids when present.
  let categoryId: string | null = null;
  if (filter.categorySlug) {
    const { data } = await supabase
      .from("categories")
      .select("id")
      .eq("slug", filter.categorySlug)
      .maybeSingle();
    categoryId = data?.id ?? null;
    if (!categoryId) return [];
  }
  let areaId: string | null = null;
  if (filter.areaSlug) {
    const { data } = await supabase
      .from("areas")
      .select("id")
      .eq("slug", filter.areaSlug)
      .maybeSingle();
    areaId = data?.id ?? null;
    if (!areaId) return [];
  }

  let query = supabase
    .from("listings")
    .select(`
      id, slug, title, type, status, created_at,
      areas:area_id ( name ),
      categories:category_id ( name ),
      listing_images ( path, sort_order )
    `)
    .eq("status", "active");
  if (categoryId) query = query.eq("category_id", categoryId);
  if (areaId) query = query.eq("area_id", areaId);
  if (filter.type === "want") query = query.eq("type", "want");
  if (filter.q) {
    query = query.textSearch("search_tsv", filter.q, {
      type: "websearch",
      config: "english",
    });
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 24);
  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    type: r.type,
    status: r.status,
    area_name: r.areas?.name ?? null,
    category_name: r.categories?.name ?? null,
    cover_path: (r.listing_images ?? [])
      .slice()
      .sort((a: any, b: any) => a.sort_order - b.sort_order)[0]?.path ?? null,
    created_at: r.created_at,
  }));
}
