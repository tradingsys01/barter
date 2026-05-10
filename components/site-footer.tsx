import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 py-6 text-sm text-zinc-500 sm:flex-row sm:justify-between">
        <p>Quadra Barter — swap goods & services, no money</p>
        <nav className="flex gap-4">
          <Link href="/terms" className="hover:text-zinc-700">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-zinc-700">
            Privacy
          </Link>
          <Link href="/feedback" className="hover:text-zinc-700">
            Feedback
          </Link>
        </nav>
      </div>
    </footer>
  );
}
