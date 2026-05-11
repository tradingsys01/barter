import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicUser } from "@/lib/users/queries";
import { getRatingSummary } from "@/lib/rating/queries";
import { createClient } from "@/lib/supabase/server";
import { ProfileHeader } from "@/components/users/profile-header";
import { ListingGrid } from "@/components/listings/listing-grid";
import type { FeedItem } from "@/lib/listings/queries";

type Params = { id: string };

export async function generateMetadata(
  { params }: { params: Promise<Params> },
): Promise<Metadata> {
  const { id } = await params;
  const u = await getPublicUser(id);
  if (!u) return { title: "Profile not found — Quadra Barter" };
  const name = u.display_name ?? "An islander";
  return {
    title: `${name} on Quadra Barter`,
    description: `${name}'s listings on Quadra Island, BC.`,
  };
}

export default async function ProfilePage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const [user, rating] = await Promise.all([
    getPublicUser(id),
    getRatingSummary(id),
  ]);
  if (!user) notFound();

  // Fetch their active listings.
  const supabase = await createClient();
  const { data: listingsData } = await supabase
    .from("listings")
    .select(`
      id, slug, title, type, status, created_at,
      route_from, route_to, schedule, seats, gas_share,
      areas:area_id ( name ),
      categories:category_id ( name, slug ),
      listing_images ( path, sort_order )
    `)
    .eq("owner_id", id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(12);

  const items: FeedItem[] = (listingsData ?? []).map((r: any) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    type: r.type,
    status: r.status,
    area_name: r.areas?.name ?? null,
    category_name: r.categories?.name ?? null,
    category_slug: r.categories?.slug ?? null,
    cover_path: (r.listing_images ?? [])
      .slice()
      .sort((a: any, b: any) => a.sort_order - b.sort_order)[0]?.path ?? null,
    created_at: r.created_at,
    route_from: r.route_from ?? null,
    route_to: r.route_to ?? null,
    schedule: r.schedule ?? null,
    seats: r.seats ?? null,
    gas_share: r.gas_share ?? false,
  }));

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <ProfileHeader user={user} rating={rating} />
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Listings</h2>
        <ListingGrid items={items} emptyText="No active listings." />
      </section>
    </main>
  );
}
