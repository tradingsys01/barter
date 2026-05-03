import Link from "next/link";
import { listFeed } from "@/lib/listings/queries";
import { ListingGrid } from "@/components/listings/listing-grid";

export default async function HomePage() {
  const items = await listFeed(24);

  return (
    <main className="mx-auto max-w-5xl space-y-10 p-6">
      <section className="space-y-3 text-center">
        <h1 className="text-3xl font-semibold sm:text-4xl">
          Swap goods and services on Quadra Island
        </h1>
        <p className="text-zinc-600">No money. Just neighbours trading what they have for what they need.</p>
        <Link
          href="/signin"
          className="inline-block rounded bg-emerald-700 px-4 py-2 text-white"
        >
          Get started
        </Link>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Latest listings</h2>
        <ListingGrid items={items} emptyText="Nothing posted yet — be the first." />
      </section>
    </main>
  );
}
