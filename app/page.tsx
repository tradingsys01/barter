import Link from "next/link";
import { searchListings } from "@/lib/listings/search";
import { ListingGrid } from "@/components/listings/listing-grid";
import { SearchBar } from "@/components/feed/search-bar";
import { CategoryChips } from "@/components/feed/category-chips";
import { getSessionUser } from "@/lib/auth";

export default async function HomePage(
  { searchParams }: { searchParams: Promise<{ q?: string; c?: string; a?: string; from?: string; to?: string }> },
) {
  const sp = await searchParams;
  const [items, user] = await Promise.all([
    searchListings({
      q: sp.q,
      categorySlug: sp.c,
      areaSlug: sp.a,
      routeFrom: sp.from,
      routeTo: sp.to,
      limit: 24,
    }),
    getSessionUser(),
  ]);

  const isFiltered = !!(sp.q || sp.c || sp.a || sp.from || sp.to);


  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      {!isFiltered && (
        <section className="hidden space-y-4 py-4 text-center sm:block sm:py-6">
          <h1 className="text-2xl font-semibold text-zinc-900 sm:text-3xl md:text-4xl">
            Swap goods and services on Quadra Island
          </h1>
          <p className="mx-auto max-w-md text-zinc-600">
            Just neighbours trading what they have for what they need.
          </p>
          {!user && (
            <Link
              href="/signin"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 font-medium text-white shadow-sm transition hover:bg-emerald-700"
            >
              Get started
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
          )}
        </section>
      )}

      <div className="space-y-4">
        <SearchBar defaultValue={sp.q} />
        <CategoryChips
          active={sp.c}
          baseParams={{ q: sp.q, a: sp.a }}
        />
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900 sm:text-xl">
          {isFiltered ? "Results" : "Latest listings"}
        </h2>
        <ListingGrid items={items} emptyText="No listings match your search." />
      </section>
    </main>
  );
}
