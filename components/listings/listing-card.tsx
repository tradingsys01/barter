import Link from "next/link";
import Image from "next/image";
import { TypeBadge } from "./type-badge";
import { listingImageUrl } from "@/lib/img";
import type { FeedItem } from "@/lib/listings/queries";

export function ListingCard({ item }: { item: FeedItem }) {
  return (
    <Link
      href={`/l/${item.id}/${item.slug}`}
      className="block overflow-hidden rounded-lg border bg-white transition hover:shadow-md"
    >
      <div className="relative aspect-square w-full bg-zinc-100">
        {item.cover_path ? (
          <Image
            src={listingImageUrl(item.cover_path)}
            alt={item.title}
            fill
            sizes="(max-width:640px) 50vw, 33vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-400">no photo</div>
        )}
      </div>
      <div className="space-y-1 p-3">
        <div className="flex items-center justify-between gap-2">
          <TypeBadge type={item.type} />
          {item.area_name && <span className="text-xs text-zinc-500">{item.area_name}</span>}
        </div>
        <h3 className="line-clamp-2 text-sm font-medium">{item.title}</h3>
      </div>
    </Link>
  );
}
