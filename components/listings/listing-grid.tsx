import { ListingCard } from "./listing-card";
import type { FeedItem } from "@/lib/listings/queries";

export function ListingGrid({ items, emptyText }: { items: FeedItem[]; emptyText?: string }) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-zinc-500">
        {emptyText ?? "Nothing here yet."}
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {items.map((item) => <ListingCard key={item.id} item={item} />)}
    </div>
  );
}
