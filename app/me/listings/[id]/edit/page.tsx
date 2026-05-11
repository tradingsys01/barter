import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { editListing, deleteListingImage } from "@/lib/listings/actions";
import { listingImageUrl } from "@/lib/img";
import { EditListingForm } from "@/components/listings/edit-listing-form";

export const metadata = { title: "Edit listing — Quadra Barter" };

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: listing }, { data: categories }, { data: areas }, { data: images }] = await Promise.all([
    supabase.from("listings").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle(),
    supabase.from("categories").select("id, name, slug").order("sort_order"),
    supabase.from("areas").select("id, name, slug").order("sort_order"),
    supabase.from("listing_images").select("id, path, sort_order").eq("listing_id", id).order("sort_order"),
  ]);
  if (!listing) notFound();
  const sortedImages = (images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const ridesCat = (categories ?? []).find((c) => c.slug === "rides");

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-12">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
            Edit listing
          </h1>
          <p className="mt-2 text-zinc-600">
            Update your listing details
          </p>
        </header>

        {/* Existing photos - outside form to allow nested delete forms */}
        {sortedImages.length > 0 && (
          <div className="mb-8 space-y-3">
            <label className="block text-sm font-medium text-zinc-700">
              Current photos
            </label>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {sortedImages.map((img) => (
                <div key={img.id} className="group relative aspect-square overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={listingImageUrl(img.path)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <form action={deleteListingImage} className="absolute right-1 top-1">
                    <input type="hidden" name="image_id" value={img.id} />
                    <input type="hidden" name="listing_id" value={listing.id} />
                    <button
                      type="submit"
                      className="rounded-full bg-black/60 p-1.5 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
                      title="Remove photo"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </div>
        )}

        <EditListingForm
          action={editListing}
          listing={listing}
          categories={categories ?? []}
          areas={areas ?? []}
          ridesCategoryId={ridesCat?.id ?? null}
        />
      </div>
    </main>
  );
}
