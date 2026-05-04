import type { PublicUser } from "@/lib/users/queries";
import type { RatingSummary } from "@/lib/rating/queries";
import { formatRatingSummary } from "@/components/chat/rating-summary";

export function ProfileHeader({ user, rating }: { user: PublicUser; rating: RatingSummary }) {
  const ratingText = formatRatingSummary(rating);
  return (
    <header className="space-y-2">
      <h1 className="text-2xl font-semibold">{user.display_name ?? "Anonymous islander"}</h1>
      <p className="text-sm text-zinc-600">
        {user.area_name ?? "Quadra Island"}
        {ratingText && <span> · {ratingText}</span>}
      </p>
      {user.bio && <p className="whitespace-pre-line text-sm text-zinc-800">{user.bio}</p>}
    </header>
  );
}
