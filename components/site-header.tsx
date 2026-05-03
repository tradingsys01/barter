import Link from "next/link";
import { getSessionUser } from "@/lib/auth";

export async function SiteHeader() {
  const user = await getSessionUser();
  return (
    <header className="border-b border-zinc-200">
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="font-semibold">Quadra Barter</Link>
        <nav className="text-sm flex items-center gap-4">
          {user ? (
            <>
              <Link href="/listings/new" className="text-zinc-700 hover:underline">Post</Link>
              <Link href="/chats" className="text-zinc-700 hover:underline">Chats</Link>
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
