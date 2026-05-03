import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import { TypeBadge } from "@/components/listings/type-badge";
import { OfferButton } from "@/components/listings/offer-button";
import { listingImageUrl } from "@/lib/img";
import { getListing } from "@/lib/listings/queries";
import { getRatingSummary } from "@/lib/rating/queries";
import { RatingSummary } from "@/components/chat/rating-summary";
import { getSessionUser } from "@/lib/auth";
import type { Metadata } from "next";

type Params = { id: string; slug: string };

export async function generateMetadata(
  { params }: { params: Promise<Params> },
): Promise<Metadata> {
  const { id } = await params;
  const l = await getListing(id);
  if (!l) return { title: "Listing not found — Quadra Barter" };
  const description = (l.description ?? l.wants_text ?? "").slice(0, 160);
  return {
    title: `${l.title} — Quadra Barter`,
    description,
    openGraph: {
      title: l.title,
      description,
      images: l.cover_path ? [listingImageUrl(l.cover_path)] : [],
      type: "article",
    },
  };
}

export default async function ListingPage({ params }: { params: Promise<Params> }) {
  const { id, slug } = await params;
  const l = await getListing(id);
  if (!l) notFound();
  if (l.slug !== slug) redirect(`/l/${l.id}/${l.slug}`);

  const ownerRating = l.owner.id
    ? await getRatingSummary(l.owner.id)
    : { avg: 0, count: 0 };
  const viewer = await getSessionUser();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": l.type === "offer_service" ? "Service" : "Product",
    name: l.title,
    description: l.description ?? undefined,
    image: l.images.map((i) => listingImageUrl(i.path)),
    areaServed: l.area_name ? `${l.area_name}, Quadra Island, BC` : "Quadra Island, BC",
    offers: {
      "@type": "Offer",
      availability: "https://schema.org/InStock",
      priceCurrency: "CAD",
      price: 0,
      description: l.wants_text ? `Swap for: ${l.wants_text}` : "Trade only — no cash",
    },
  };

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="flex items-center gap-2">
        <TypeBadge type={l.type} />
        {l.area_name && <span className="text-sm text-zinc-500">{l.area_name}</span>}
        {l.category_name && <span className="text-sm text-zinc-500">· {l.category_name}</span>}
      </div>

      <h1 className="text-3xl font-semibold">{l.title}</h1>

      <div className="pt-2">
        <OfferButton
          listingId={l.id}
          listingSlug={l.slug}
          viewerId={viewer?.id}
          ownerId={l.owner.id}
        />
      </div>

      {l.images.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {l.images.map((img) => (
            <div key={img.path} className="relative aspect-square overflow-hidden rounded-lg bg-zinc-100">
              <Image
                src={listingImageUrl(img.path)}
                alt={img.alt_text ?? l.title}
                fill
                sizes="(max-width:640px) 50vw, 33vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      )}

      {l.description && <p className="whitespace-pre-line text-zinc-800">{l.description}</p>}

      {l.wants_text && (
        <div className="rounded-lg border bg-zinc-50 p-4">
          <h2 className="text-sm font-semibold text-zinc-700">What I'd swap for</h2>
          <p className="mt-1 text-zinc-800">{l.wants_text}</p>
        </div>
      )}

      <p className="text-sm text-zinc-500">
        Posted by {l.owner.display_name ?? "someone"}{" "}
        <RatingSummary summary={ownerRating} />
      </p>
    </main>
  );
}
