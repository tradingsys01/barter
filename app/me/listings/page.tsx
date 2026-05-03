import Link from "next/link";
import { listMyListings } from "@/lib/listings/queries";
import { archiveListing } from "@/lib/listings/actions";
import { TypeBadge } from "@/components/listings/type-badge";
import { listingImageUrl } from "@/lib/img";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "My listings — Quadra Barter" };

export default async function MyListingsPage() {
  const user = await requireUser();
  const items = await listMyListings(user.id);

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My listings</h1>
        <Link href="/listings/new" className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white">
          + Post
        </Link>
      </div>
      <ul className="divide-y rounded-lg border">
        {items.length === 0 && <li className="p-6 text-center text-sm text-zinc-500">No listings yet.</li>}
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-4 p-3">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded bg-zinc-100">
              {it.cover_path && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={listingImageUrl(it.cover_path)} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2"><TypeBadge type={it.type} /></div>
              <Link href={`/l/${it.id}/${it.slug}`} className="text-sm font-medium hover:underline">
                {it.title}
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/me/listings/${it.id}/edit`} className="rounded border px-2 py-1 text-xs">Edit</Link>
              <form action={archiveListing}>
                <input type="hidden" name="id" value={it.id} />
                <button type="submit" className="rounded border px-2 py-1 text-xs text-red-700">Archive</button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
