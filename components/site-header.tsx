import Link from "next/link";
import { getSessionUser, getProfile } from "@/lib/auth";
import { getUnreadChatCount } from "@/lib/chat/queries";
import { MobileMenu } from "./mobile-menu";

export async function SiteHeader() {
  const user = await getSessionUser();
  const [profile, unread] = user
    ? await Promise.all([getProfile(user.id), getUnreadChatCount(user.id)])
    : [null, 0];
  const greeting = profile?.display_name ?? user?.email?.split("@")[0];
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-zinc-900">
          <span className="text-xl">🔄</span>
          <span>Quadra Barter</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 text-sm sm:flex">
          {user ? (
            <>
              {greeting && (
                <span className="mr-2 flex items-center gap-1.5 text-zinc-500">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                  {greeting}
                </span>
              )}
              <Link
                href="/listings/new"
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700"
              >
                + Post
              </Link>
              <Link
                href="/me/listings"
                className="rounded-lg px-3 py-1.5 text-zinc-700 transition hover:bg-zinc-100"
              >
                My listings
              </Link>
              <Link
                href="/chats"
                className="relative inline-flex items-center rounded-lg px-3 py-1.5 text-zinc-700 transition hover:bg-zinc-100"
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
              <Link
                href="/me"
                className="rounded-lg px-3 py-1.5 text-zinc-700 transition hover:bg-zinc-100"
              >
                Account
              </Link>
              <Link
                href="/feedback"
                className="rounded-lg px-3 py-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700"
                title="Send feedback"
              >
                Feedback
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/feedback"
                className="rounded-lg px-3 py-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700"
              >
                Feedback
              </Link>
              <Link
                href="/signin"
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700"
              >
                Sign in
              </Link>
            </>
          )}
        </nav>

        {/* Mobile menu */}
        <MobileMenu user={user} greeting={greeting} unread={unread} />
      </div>
    </header>
  );
}
