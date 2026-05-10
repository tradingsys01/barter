import Link from "next/link";
import { searchListings } from "@/lib/listings/search";
import { ListingGrid } from "@/components/listings/listing-grid";
import { SearchBar } from "@/components/feed/search-bar";
import { CategoryChips } from "@/components/feed/category-chips";
import { getSessionUser } from "@/lib/auth";

export default async function HomePage(
  { searchParams }: { searchParams: Promise<{ q?: string; c?: string; a?: string; t?: string }> },
) {
  const sp = await searchParams;
  const wantOnly = sp.t === "want";
  const [items, user] = await Promise.all([
    searchListings({
      q: sp.q,
      categorySlug: sp.c,
      areaSlug: sp.a,
      type: wantOnly ? "want" : undefined,
      limit: 24,
    }),
    getSessionUser(),
  ]);

  const isFiltered = !!(sp.q || sp.c || sp.a || wantOnly);


  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      {!isFiltered && (
        <section className="space-y-3 text-center">
          <h1 className="text-3xl font-semibold sm:text-4xl">
            Swap goods and services on Quadra Island
          </h1>
          <p className="text-zinc-600">Just neighbours trading what they have for what they need.</p>
          {!user && (
            <Link
              href="/signin"
              className="inline-block rounded bg-emerald-700 px-4 py-2 text-white"
            >
              Get started
            </Link>
          )}
        </section>
      )}

      <div className="space-y-3">
        <SearchBar defaultValue={sp.q} />
        <CategoryChips
          active={sp.c}
          wantOnly={wantOnly}
          baseParams={{ q: sp.q, a: sp.a, t: wantOnly ? "want" : undefined }}
        />
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">
          {isFiltered ? "Results" : "Latest listings"}
        </h2>
        <ListingGrid items={items} emptyText="No listings match your search." />
      </section>
    </main>
  );
}
