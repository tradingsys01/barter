import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { editListing } from "@/lib/listings/actions";

export const metadata = { title: "Edit listing — Quadra Barter" };

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: listing }, { data: categories }, { data: areas }] = await Promise.all([
    supabase.from("listings").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle(),
    supabase.from("categories").select("id, name").order("sort_order"),
    supabase.from("areas").select("id, name").order("sort_order"),
  ]);
  if (!listing) notFound();

  return (
    <main className="mx-auto max-w-xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Edit listing</h1>
      <form action={editListing} className="space-y-4">
        <input type="hidden" name="id" value={listing.id} />
        <div className="space-y-1">
          <label htmlFor="type" className="block text-sm font-medium">Type</label>
          <select id="type" name="type" defaultValue={listing.type} className="w-full rounded border px-3 py-2">
            <option value="offer">Offering</option>
            <option value="want">Wanted</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="category_id" className="block text-sm font-medium">Category</label>
          <select id="category_id" name="category_id" defaultValue={listing.category_id ?? ""} className="w-full rounded border px-3 py-2">
            {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="title" className="block text-sm font-medium">Title</label>
          <input id="title" name="title" defaultValue={listing.title} required minLength={3} maxLength={120}
                 className="w-full rounded border px-3 py-2" />
        </div>
        <div className="space-y-1">
          <label htmlFor="description" className="block text-sm font-medium">Description</label>
          <textarea id="description" name="description" defaultValue={listing.description ?? ""} rows={4} maxLength={2000}
                    className="w-full rounded border px-3 py-2" />
        </div>
        <div className="space-y-1">
          <label htmlFor="area_id" className="block text-sm font-medium">Area</label>
          <select id="area_id" name="area_id" defaultValue={listing.area_id ?? ""} className="w-full rounded border px-3 py-2">
            {(areas ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="wants_text" className="block text-sm font-medium">What I&apos;d swap for</label>
          <input id="wants_text" name="wants_text" defaultValue={listing.wants_text ?? ""} maxLength={500}
                 className="w-full rounded border px-3 py-2" />
        </div>
        <button type="submit" className="rounded bg-emerald-700 px-4 py-2 text-white">Save</button>
      </form>
    </main>
  );
}
