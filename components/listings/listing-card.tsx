import Link from "next/link";
import Image from "next/image";
import { TypeBadge } from "./type-badge";
import { listingImageUrl } from "@/lib/img";
import type { FeedItem } from "@/lib/listings/queries";

export function ListingCard({ item }: { item: FeedItem }) {
  return (
    <Link
      href={`/l/${item.id}/${item.slug}`}
      className="group block overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-all hover:border-zinc-300 hover:shadow-md"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-gradient-to-br from-zinc-100 to-zinc-50">
        {item.cover_path ? (
          <Image
            src={listingImageUrl(item.cover_path)}
            alt={item.title}
            fill
            sizes="(max-width:640px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-zinc-300">
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs font-medium">No photo</span>
          </div>
        )}
      </div>
      <div className="space-y-1.5 p-3">
        <div className="flex items-center justify-between gap-2">
          <TypeBadge type={item.type} />
          {item.area_name && (
            <span className="flex items-center gap-1 text-xs text-zinc-500">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {item.area_name}
            </span>
          )}
        </div>
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-zinc-900">{item.title}</h3>
      </div>
    </Link>
  );
}
