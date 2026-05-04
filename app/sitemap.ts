import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 3600; // hourly

const ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "http://localhost:3000";

export type SitemapInputs = {
  origin: string;
  listings: { id: string; slug: string; updated_at: string }[];
  categories: { slug: string }[];
  areas: { slug: string }[];
};

export function buildSitemapEntries(inputs: SitemapInputs): MetadataRoute.Sitemap {
  const { origin, listings, categories, areas } = inputs;
  const out: MetadataRoute.Sitemap = [];
  out.push({ url: origin, lastModified: new Date(), changeFrequency: "daily", priority: 1 });
  for (const l of listings) {
    out.push({
      url: `${origin}/l/${l.id}/${l.slug}`,
      lastModified: new Date(l.updated_at),
      changeFrequency: "weekly",
      priority: 0.8,
    });
  }
  for (const c of categories) {
    out.push({
      url: `${origin}/c/${c.slug}`,
      changeFrequency: "daily",
      priority: 0.6,
    });
  }
  for (const a of areas) {
    out.push({
      url: `${origin}/area/${a.slug}`,
      changeFrequency: "daily",
      priority: 0.6,
    });
  }
  return out;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();
  const [{ data: listings }, { data: categories }, { data: areas }] = await Promise.all([
    supabase.from("listings").select("id, slug, updated_at").eq("status", "active"),
    supabase.from("categories").select("slug"),
    supabase.from("areas").select("slug"),
  ]);

  return buildSitemapEntries({
    origin: ORIGIN,
    listings: (listings ?? []) as SitemapInputs["listings"],
    categories: (categories ?? []) as SitemapInputs["categories"],
    areas: (areas ?? []) as SitemapInputs["areas"],
  });
}
