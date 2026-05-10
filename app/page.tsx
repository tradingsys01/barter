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

  const wantedHref = (() => {
    const next = new URLSearchParams();
    if (sp.q) next.set("q", sp.q);
    if (sp.c) next.set("c", sp.c);
    if (sp.a) next.set("a", sp.a);
    if (!wantOnly) next.set("t", "want");
    const s = next.toString();
    return s ? `/?${s}` : "/";
  })();

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
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={wantedHref}
            aria-pressed={wantOnly}
            className={
              "shrink-0 rounded-full border px-3 py-1 " +
              (wantOnly
                ? "border-amber-700 bg-amber-50 text-amber-900"
                : "border-zinc-300 text-zinc-700 hover:border-zinc-400")
            }
          >
            🙋 Wanted
          </Link>
          <span className="text-xs text-zinc-500">
            {wantOnly ? "Showing what people want" : "Show only what people want"}
          </span>
        </div>
        <CategoryChips active={sp.c} baseParams={{ q: sp.q, a: sp.a, t: wantOnly ? "want" : undefined }} />
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
