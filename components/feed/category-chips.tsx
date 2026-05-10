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

  const allWithAll = [{ slug: "", name: "All", icon: "✨" }, ...allCats];

  return (
    <nav
      className="grid grid-cols-4 gap-1.5 sm:flex sm:flex-wrap sm:gap-2"
      aria-label="Categories"
    >
      {allWithAll.map((c) => {
        const isActive = c.slug === "" ? !active : active === c.slug;
        return (
          <Link
            key={c.slug || "all"}
            href={withParam(baseParams, "c", c.slug || undefined)}
            className={
              "flex flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-center transition-all active:scale-95 " +
              "sm:flex-row sm:gap-1.5 sm:rounded-full sm:px-4 sm:py-2 " +
              (isActive
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 hover:shadow-sm")
            }
          >
            <span className="text-lg sm:text-base">{c.icon}</span>
            <span className="text-[11px] font-medium leading-tight sm:text-sm">
              {c.name}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
