import type { RatingSummary } from "@/lib/rating/queries";

export function formatRatingSummary(s: RatingSummary): string | null {
  if (s.count === 0) return null;
  const avg = s.avg.toFixed(1);
  const noun = s.count === 1 ? "review" : "reviews";
  return `★ ${avg} · ${s.count} ${noun}`;
}

export function RatingSummary({ summary }: { summary: RatingSummary }) {
  const text = formatRatingSummary(summary);
  if (!text) return null;
  return <span className="text-sm text-zinc-600">{text}</span>;
}
