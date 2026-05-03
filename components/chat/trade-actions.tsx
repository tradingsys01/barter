import { markTradeDone, confirmTrade, cancelTrade } from "@/lib/trade/actions";
import type { Trade } from "@/lib/trade/queries";

type Props = {
  chatId: string;
  viewerId: string;
  pending: Trade | null;
  hasCompleted: boolean;
};

export function TradeActions({ chatId, viewerId, pending, hasCompleted }: Props) {
  if (!pending) {
    return (
      <div className="rounded-lg border bg-white p-3">
        <p className="text-sm text-zinc-700">
          {hasCompleted
            ? "This trade is complete. Start another by marking it done."
            : "When you've agreed on the swap, mark the trade done."}
        </p>
        <form action={markTradeDone} className="mt-2">
          <input type="hidden" name="chat_id" value={chatId} />
          <button type="submit" className="rounded border px-3 py-1.5 text-sm">
            Mark trade done
          </button>
        </form>
      </div>
    );
  }

  if (viewerId === pending.party_a) {
    return (
      <div className="rounded-lg border bg-amber-50 p-3 text-sm text-amber-900">
        <p>Waiting for the other party to confirm the trade.</p>
        <form action={cancelTrade} className="mt-2">
          <input type="hidden" name="trade_id" value={pending.id} />
          <button type="submit" className="rounded border border-amber-300 px-3 py-1 text-xs">
            Cancel
          </button>
        </form>
      </div>
    );
  }

  // viewer is party_b
  return (
    <div className="rounded-lg border bg-emerald-50 p-3 text-sm text-emerald-900">
      <p>The other party marked this trade done. Confirm if it happened.</p>
      <div className="mt-2 flex gap-2">
        <form action={confirmTrade}>
          <input type="hidden" name="trade_id" value={pending.id} />
          <button type="submit" className="rounded bg-emerald-700 px-3 py-1.5 text-xs text-white">
            Confirm
          </button>
        </form>
        <form action={cancelTrade}>
          <input type="hidden" name="trade_id" value={pending.id} />
          <button type="submit" className="rounded border border-emerald-300 px-3 py-1.5 text-xs">
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}
