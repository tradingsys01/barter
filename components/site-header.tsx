import Link from "next/link";
import { getSessionUser, getProfile } from "@/lib/auth";
import { getUnreadChatCount } from "@/lib/chat/queries";

export async function SiteHeader() {
  const user = await getSessionUser();
  const [profile, unread] = user
    ? await Promise.all([getProfile(user.id), getUnreadChatCount(user.id)])
    : [null, 0];
  const greeting = profile?.display_name ?? user?.email?.split("@")[0];
  return (
    <header className="border-b border-zinc-200">
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="font-semibold">Quadra Barter</Link>
        <nav className="text-sm flex items-center gap-4">
          {user ? (
            <>
              {greeting && (
                <span className="hidden sm:inline-flex items-center gap-1.5 text-zinc-600">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                  Hi, {greeting}
                </span>
              )}
              <Link href="/listings/new" className="text-zinc-700 hover:underline">Post</Link>
              <Link
                href="/chats"
                className="relative inline-flex items-center text-zinc-700 hover:underline"
              >
                Chats
                {unread > 0 && (
                  <span
                    aria-label={`${unread} unread`}
                    className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-xs font-medium text-white"
                  >
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
              <Link href="/me" className="text-zinc-700 hover:underline">My account</Link>
            </>
          ) : (
            <Link href="/signin" className="text-zinc-700 hover:underline">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
