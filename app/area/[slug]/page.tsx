import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listByArea } from "@/lib/listings/queries";
import { ListingGrid } from "@/components/listings/listing-grid";
import type { Metadata } from "next";

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: area } = await supabase.from("areas").select("name").eq("slug", slug).maybeSingle();
  if (!area) return { title: "Area not found" };
  return {
    title: `${area.name}, Quadra Island — Quadra Barter`,
    description: `Listings posted in ${area.name}. Trade with your neighbours.`,
  };
}

export default async function AreaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: area } = await supabase.from("areas").select("name").eq("slug", slug).maybeSingle();
  if (!area) notFound();
  const items = await listByArea(slug);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">{area.name}, Quadra Island</h1>
      <ListingGrid items={items} emptyText={`No listings in ${area.name} yet.`} />
    </main>
  );
}
