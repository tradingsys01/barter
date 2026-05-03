import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { createListing } from "@/lib/listings/actions";
import { PhotoUploader } from "@/components/listings/photo-uploader";

export const metadata = { title: "Post a listing — Quadra Barter" };

export default async function NewListingPage() {
  await requireUser();
  const supabase = await createClient();
  const [{ data: categories }, { data: areas }] = await Promise.all([
    supabase.from("categories").select("id, name, slug").order("sort_order"),
    supabase.from("areas").select("id, name, slug").order("sort_order"),
  ]);

  return (
    <main className="mx-auto max-w-xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Post a listing</h1>
      <form action={createListing} className="space-y-4">
        <Field label="Type" htmlFor="type">
          <select id="type" name="type" required className="w-full rounded border px-3 py-2">
            <option value="offer_goods">Offering goods</option>
            <option value="offer_service">Offering a service</option>
            <option value="want">Wanted</option>
          </select>
        </Field>

        <Field label="Title" htmlFor="title">
          <input
            id="title"
            name="title"
            required
            minLength={3}
            maxLength={120}
            className="w-full rounded border px-3 py-2"
          />
        </Field>

        <Field label="Description" htmlFor="description">
          <textarea
            id="description"
            name="description"
            maxLength={2000}
            rows={4}
            className="w-full rounded border px-3 py-2"
          />
        </Field>

        <Field label="Category" htmlFor="category_id">
          <select
            id="category_id"
            name="category_id"
            required
            className="w-full rounded border px-3 py-2"
          >
            <option value="">Pick one…</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Area" htmlFor="area_id">
          <select
            id="area_id"
            name="area_id"
            required
            className="w-full rounded border px-3 py-2"
          >
            <option value="">Pick one…</option>
            {(areas ?? []).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </Field>

        <Field label="What I'd swap for" htmlFor="wants_text">
          <input
            id="wants_text"
            name="wants_text"
            maxLength={500}
            className="w-full rounded border px-3 py-2"
          />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="accepts_credits" />
          Also accept community credits
        </label>

        <PhotoUploader name="photos" />

        <button type="submit" className="rounded bg-emerald-700 px-4 py-2 text-white">
          Publish
        </button>
      </form>
    </main>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
