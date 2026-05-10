import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type Props = {
  /** The currently-active category slug, if any (includes "wanted" pseudo-category). */
  active?: string;
  /** Preserve the rest of the searchParams (e.g. q=…) when switching chips. */
  baseParams: Record<string, string | undefined>;
};

function withParam(params: Record<string, string | undefined>, key: string, value: string | undefined): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k !== key && v) sp.set(k, v);
  }
  if (value) sp.set(key, value);
  const s = sp.toString();
  return s ? `/?${s}` : "/";
}

export async function CategoryChips({ active, baseParams }: Props) {
  const supabase = await createClient();
  const { data: cats } = await supabase
    .from("categories")
    .select("slug, name, icon")
    .order("sort_order");

  const allCats = [{ slug: "wanted", name: "Wanted", icon: "🙋" }, ...(cats ?? [])];

  return (
    <div className="relative -mx-3 overflow-hidden sm:mx-0">
      {/* Fade hints for scroll */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-4 bg-gradient-to-r from-white to-transparent sm:hidden" />
      <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-4 bg-gradient-to-l from-white to-transparent sm:hidden" />

      <nav
        className="flex gap-2 overflow-x-auto px-3 pb-2 pt-1 scrollbar-none sm:flex-wrap sm:px-0"
        aria-label="Categories"
      >
        <Link
          href={withParam(baseParams, "c", undefined)}
          className={
            "shrink-0 rounded-full px-3.5 py-2.5 text-sm font-medium transition-all sm:px-4 sm:py-2 " +
            (!active
              ? "bg-emerald-600 text-white shadow-sm"
              : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200")
          }
        >
          All
        </Link>
        {allCats.map((c) => (
          <Link
            key={c.slug}
            href={withParam(baseParams, "c", c.slug)}
            className={
              "shrink-0 rounded-full px-3.5 py-2.5 text-sm font-medium transition-all sm:px-4 sm:py-2 " +
              (active === c.slug
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200")
            }
          >
            {c.icon && <span className="mr-1.5">{c.icon}</span>}
            {c.name}
          </Link>
        ))}
      </nav>
    </div>
  );
}
