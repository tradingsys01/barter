import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type Props = {
  /** The currently-active category slug, if any. */
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

  return (
    <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 text-sm" aria-label="Categories">
      <Link
        href={withParam(baseParams, "c", undefined)}
        className={
          "shrink-0 rounded-full border px-3 py-1 " +
          (!active ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-zinc-300")
        }
      >
        All
      </Link>
      {(cats ?? []).map((c: any) => (
        <Link
          key={c.slug}
          href={withParam(baseParams, "c", c.slug)}
          className={
            "shrink-0 rounded-full border px-3 py-1 " +
            (active === c.slug ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-zinc-300")
          }
        >
          {c.icon && <span className="mr-1">{c.icon}</span>}
          {c.name}
        </Link>
      ))}
    </nav>
  );
}
