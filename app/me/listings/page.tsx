import Link from "next/link";
import { listMyListings } from "@/lib/listings/queries";
import { archiveListing, extendListing } from "@/lib/listings/actions";
import { TypeBadge } from "@/components/listings/type-badge";
import { listingImageUrl } from "@/lib/img";
import { requireUser } from "@/lib/auth";

function formatExpiry(expiresAt: string | null): { text: string; urgent: boolean } {
  if (!expiresAt) return { text: "", urgent: false };
  const now = Date.now();
  const expires = new Date(expiresAt).getTime();
  const daysLeft = Math.ceil((expires - now) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { text: "Expired", urgent: true };
  if (daysLeft === 0) return { text: "Expires today", urgent: true };
  if (daysLeft === 1) return { text: "Expires tomorrow", urgent: true };
  if (daysLeft <= 7) return { text: `Expires in ${daysLeft} days`, urgent: true };
  return { text: `Expires in ${daysLeft} days`, urgent: false };
}

export const dynamic = "force-dynamic";
export const metadata = { title: "My listings — Quadra Barter" };

export default async function MyListingsPage() {
  const user = await requireUser();
  const items = await listMyListings(user.id);

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">My listings</h1>
          <p className="mt-1 text-sm text-zinc-500">{items.length} listing{items.length !== 1 ? "s" : ""}</p>
        </div>
        <Link
          href="/listings/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Post
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 py-16">
          <div className="mb-4 rounded-full bg-zinc-100 p-4">
            <svg className="h-8 w-8 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <p className="mb-1 font-medium text-zinc-900">No listings yet</p>
          <p className="mb-4 text-sm text-zinc-500">Create your first listing to start trading</p>
          <Link
            href="/listings/new"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
          >
            Create listing
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm transition hover:border-zinc-300 hover:shadow-md sm:p-4"
            >
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-zinc-100 to-zinc-50 sm:h-24 sm:w-24">
                {it.cover_path ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={listingImageUrl(it.cover_path)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-zinc-300">
                    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <TypeBadge type={it.type} />
                  {(() => {
                    const { text, urgent } = formatExpiry(it.expires_at);
                    if (!text) return null;
                    return (
                      <span className={`text-xs ${urgent ? "text-amber-600 font-medium" : "text-zinc-500"}`}>
                        {text}
                      </span>
                    );
                  })()}
                </div>
                <Link
                  href={`/l/${it.id}/${it.slug}`}
                  className="block truncate text-sm font-medium text-zinc-900 hover:text-emerald-700 sm:text-base"
                >
                  {it.title}
                </Link>
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                <form action={extendListing}>
                  <input type="hidden" name="id" value={it.id} />
                  <button
                    type="submit"
                    className="inline-flex w-full items-center justify-center rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 sm:text-sm"
                  >
                    +30 days
                  </button>
                </form>
                <Link
                  href={`/me/listings/${it.id}/edit`}
                  className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 sm:text-sm"
                >
                  Edit
                </Link>
                <form action={archiveListing}>
                  <input type="hidden" name="id" value={it.id} />
                  <button
                    type="submit"
                    className="inline-flex w-full items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 sm:text-sm"
                  >
                    Archive
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
