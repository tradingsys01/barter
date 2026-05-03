import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getChat, getMessages } from "@/lib/chat/queries";
import { listingImageUrl } from "@/lib/img";
import { MessageList } from "@/components/chat/message-list";
import { SendMessageForm } from "@/components/chat/send-message-form";

export const dynamic = "force-dynamic";

type Params = { id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const chat = await getChat(id);
  return { title: chat ? `Chat — ${chat.listing.title}` : "Chat" };
}

export default async function ChatPage({ params }: { params: Promise<Params> }) {
  const user = await requireUser();
  const { id } = await params;

  const chat = await getChat(id);
  if (!chat) notFound();
  if (chat.initiator.id !== user.id && chat.owner.id !== user.id) notFound();

  const messages = await getMessages(id);
  const otherParty = chat.initiator.id === user.id ? chat.owner : chat.initiator;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex items-center gap-3 rounded-lg border bg-white p-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-zinc-100">
          {chat.listing.cover_path && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={listingImageUrl(chat.listing.cover_path)}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <Link
            href={`/l/${chat.listing.id}/${chat.listing.slug}`}
            className="block truncate text-sm font-medium hover:underline"
          >
            {chat.listing.title}
          </Link>
          <p className="text-xs text-zinc-500">with {otherParty.display_name ?? "someone"}</p>
        </div>
      </header>

      <section className="min-h-[40vh] rounded-lg border bg-white p-3">
        <MessageList messages={messages} viewerId={user.id} />
      </section>

      <SendMessageForm chatId={chat.id} />
    </main>
  );
}
