import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Page() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">
        Swap goods and services on Quadra Island.
      </h1>
      <p className="mt-4 text-lg text-zinc-600">
        No money. No shipping. Just neighbours and visitors trading what they have for what they need.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/signin"><Button>Get started</Button></Link>
      </div>
      <p className="mt-12 text-sm text-zinc-500">
        Listings, chat, and ratings are coming next. Sign in now to be ready when we launch.
      </p>
    </main>
  );
}
