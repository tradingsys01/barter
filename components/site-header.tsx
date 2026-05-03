import Link from "next/link";
import { getSessionUser } from "@/lib/auth";

export async function SiteHeader() {
  const user = await getSessionUser();
  return (
    <header className="border-b border-zinc-200">
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="font-semibold">Quadra Barter</Link>
        <nav className="text-sm">
          {user ? (
            <Link href="/me" className="text-zinc-700 hover:underline">My account</Link>
          ) : (
            <Link href="/signin" className="text-zinc-700 hover:underline">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
