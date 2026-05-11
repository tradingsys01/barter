import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { createListing } from "@/lib/listings/actions";
import { ListingForm } from "@/components/listings/listing-form";

export const metadata = { title: "Post a listing — Quadra Barter" };

export default async function NewListingPage() {
  await requireUser();
  const supabase = await createClient();
  const [{ data: categories }, { data: areas }] = await Promise.all([
    supabase.from("categories").select("id, name, slug").order("sort_order"),
    supabase.from("areas").select("id, name, slug").order("sort_order"),
  ]);

  const ridesCat = (categories ?? []).find((c) => c.slug === "rides");

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-12">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
            Post a listing
          </h1>
          <p className="mt-2 text-zinc-600">
            Share what you have or find what you need
          </p>
        </header>

        <ListingForm
          action={createListing}
          categories={categories ?? []}
          areas={areas ?? []}
          ridesCategoryId={ridesCat?.id ?? null}
        />
      </div>
    </main>
  );
}
