import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listMyChats } from "@/lib/chat/queries";
import { listingImageUrl } from "@/lib/img";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chats — Quadra Barter" };

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default async function ChatsPage() {
  const user = await requireUser();
  const chats = await listMyChats(user.id);

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Chats</h1>
      {chats.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-zinc-500">
          No conversations yet.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {chats.map((c) => (
            <li key={c.id}>
              <Link href={`/chats/${c.id}`} className="flex items-center gap-3 p-3 hover:bg-zinc-50">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-zinc-100">
                  {c.cover_path && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={listingImageUrl(c.cover_path)} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{c.listing_title}</span>
                    <span className="shrink-0 text-xs text-zinc-500">{timeAgo(c.last_message_at)}</span>
                  </div>
                  <p className="truncate text-xs text-zinc-600">
                    {c.other_party.display_name ?? "Someone"}{" "}
                    {c.last_message_preview ? `· ${c.last_message_preview}` : ""}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
