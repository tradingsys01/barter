import Link from "next/link";
import { startChat } from "@/lib/chat/actions";

type Props = {
  listingId: string;
  listingSlug: string;
  /** undefined = anonymous viewer; null still means signed-in. */
  viewerId: string | undefined;
  ownerId: string;
};

export function OfferButton({ listingId, listingSlug, viewerId, ownerId }: Props) {
  if (!viewerId) {
    return (
      <Link
        href={`/signin?next=/l/${listingId}/${listingSlug}`}
        className="inline-block rounded bg-emerald-700 px-4 py-2 text-white"
      >
        Sign in to offer a swap
      </Link>
    );
  }
  if (viewerId === ownerId) return null;
  return (
    <form action={startChat}>
      <input type="hidden" name="listing_id" value={listingId} />
      <button
        type="submit"
        className="inline-block rounded bg-emerald-700 px-4 py-2 text-white"
      >
        Offer a swap
      </button>
    </form>
  );
}
