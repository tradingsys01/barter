"use client";

import { useState } from "react";
import { rateTrade } from "@/lib/rating/actions";

export function RatingForm({ tradeId }: { tradeId: string }) {
  const [stars, setStars] = useState<number>(0);

  return (
    <div className="rounded-lg border bg-white p-3 text-sm">
      <h3 className="font-semibold">How was the trade?</h3>
      <form action={rateTrade} className="mt-2 space-y-2">
        <input type="hidden" name="trade_id" value={tradeId} />
        <input type="hidden" name="stars" value={stars} />
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              type="button"
              key={n}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              onClick={() => setStars(n)}
              className={
                "rounded px-2 py-1 text-lg " +
                (stars >= n ? "text-amber-500" : "text-zinc-300")
              }
            >
              ★
            </button>
          ))}
        </div>
        <label htmlFor="rating-comment" className="block text-xs font-medium">Comment (optional)</label>
        <textarea
          id="rating-comment"
          name="comment"
          maxLength={500}
          rows={2}
          className="w-full rounded border px-3 py-2 text-sm"
          placeholder="Anything you'd like to say…"
        />
        <button
          type="submit"
          disabled={stars === 0}
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Submit rating
        </button>
      </form>
    </div>
  );
}
