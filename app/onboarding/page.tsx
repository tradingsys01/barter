import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Welcome — Quadra Barter" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: areas } = await supabase
    .from("areas")
    .select("id, name")
    .order("sort_order");

  async function save(formData: FormData) {
    "use server";
    const display_name = String(formData.get("display_name") ?? "").trim();
    const area_id = String(formData.get("area_id") ?? "");
    if (!display_name || !area_id) return;

    const supabase = await createClient();
    await supabase.from("users").upsert({
      id: user.id,
      email: user.email!,
      display_name,
      area_id,
    });
    redirect("/me");
  }

  return (
    <main className="flex min-h-[80vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Welcome header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
            <span className="text-3xl">🤝</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
            Welcome to Quadra Barter
          </h1>
          <p className="mt-2 text-zinc-600">
            Just a couple of details and you&apos;re ready to start trading
          </p>
        </div>

        {/* Form card */}
        <form
          action={save}
          className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="space-y-2">
            <label htmlFor="display_name" className="block text-sm font-medium text-zinc-700">
              What should we call you?
            </label>
            <input
              id="display_name"
              name="display_name"
              required
              maxLength={40}
              placeholder="Your name or nickname"
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            <p className="text-xs text-zinc-500">This is how other islanders will see you</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="area_id" className="block text-sm font-medium text-zinc-700">
              Where on Quadra are you?
            </label>
            <select
              id="area_id"
              name="area_id"
              required
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">Choose your area…</option>
              {areas?.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <p className="text-xs text-zinc-500">Helps neighbours find local swaps</p>
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-emerald-600 px-6 py-3 text-base font-medium text-white shadow-md shadow-emerald-600/20 transition-all hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-600/25 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 active:scale-[0.98]"
          >
            Get started
          </button>
        </form>

        {/* Footer note */}
        <p className="mt-6 text-center text-xs text-zinc-500">
          By continuing, you agree to our community guidelines:<br />
          be kind, trade fair, keep it local.
        </p>
      </div>
    </main>
  );
}
