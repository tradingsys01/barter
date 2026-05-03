import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listByCategory } from "@/lib/listings/queries";
import { ListingGrid } from "@/components/listings/listing-grid";
import type { Metadata } from "next";

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: cat } = await supabase.from("categories").select("name").eq("slug", slug).maybeSingle();
  if (!cat) return { title: "Category not found" };
  return {
    title: `${cat.name} on Quadra Island — Quadra Barter`,
    description: `Swap, find, and offer ${cat.name.toLowerCase()} with neighbours on Quadra Island.`,
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: cat } = await supabase.from("categories").select("name").eq("slug", slug).maybeSingle();
  if (!cat) notFound();
  const items = await listByCategory(slug);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">{cat.name} on Quadra Island</h1>
      <ListingGrid items={items} emptyText={`No ${cat.name.toLowerCase()} listings yet.`} />
    </main>
  );
}
