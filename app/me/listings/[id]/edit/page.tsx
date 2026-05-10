import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { editListing } from "@/lib/listings/actions";

export const metadata = { title: "Edit listing — Quadra Barter" };

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: listing }, { data: categories }, { data: areas }] = await Promise.all([
    supabase.from("listings").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle(),
    supabase.from("categories").select("id, name").order("sort_order"),
    supabase.from("areas").select("id, name").order("sort_order"),
  ]);
  if (!listing) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-12">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
            Edit listing
          </h1>
          <p className="mt-2 text-zinc-600">
            Update your listing details
          </p>
        </header>

        <form action={editListing} className="space-y-8">
          <input type="hidden" name="id" value={listing.id} />

          {/* Type & Category row */}
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Type" htmlFor="type">
              <select
                id="type"
                name="type"
                defaultValue={listing.type}
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="offer">Offering</option>
                <option value="want">Wanted</option>
              </select>
            </Field>

            <Field label="Category" htmlFor="category_id">
              <select
                id="category_id"
                name="category_id"
                defaultValue={listing.category_id ?? ""}
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* Title */}
          <Field label="Title" htmlFor="title">
            <input
              id="title"
              name="title"
              defaultValue={listing.title}
              required
              minLength={3}
              maxLength={120}
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-lg text-zinc-900 shadow-sm transition-colors placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </Field>

          {/* Description */}
          <Field label="Description" htmlFor="description" optional>
            <textarea
              id="description"
              name="description"
              defaultValue={listing.description ?? ""}
              rows={5}
              maxLength={2000}
              placeholder="Add details about condition, quantity, or anything else…"
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </Field>

          {/* Area & Swap preferences row */}
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Area" htmlFor="area_id">
              <select
                id="area_id"
                name="area_id"
                defaultValue={listing.area_id ?? ""}
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                {(areas ?? []).map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </Field>

            <Field label="What I'd swap for" htmlFor="wants_text" optional>
              <input
                id="wants_text"
                name="wants_text"
                defaultValue={listing.wants_text ?? ""}
                maxLength={500}
                placeholder="e.g. firewood, eggs, help with…"
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </Field>
          </div>

          {/* Submit */}
          <div className="flex justify-end border-t border-zinc-100 pt-6">
            <button
              type="submit"
              className="rounded-lg bg-emerald-600 px-8 py-3 text-base font-medium text-white shadow-md shadow-emerald-600/20 transition-all hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-600/25 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 active:scale-[0.98]"
            >
              Save changes
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function Field({
  label,
  htmlFor,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-zinc-700">
        {label}
        {optional && <span className="ml-1 font-normal text-zinc-500">(optional)</span>}
      </label>
      {children}
    </div>
  );
}
