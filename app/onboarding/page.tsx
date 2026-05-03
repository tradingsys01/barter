import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <main className="min-h-screen flex items-center justify-center p-6">
      <form action={save} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Welcome</h1>
        <p className="text-sm text-zinc-600">A couple of details and you're in.</p>

        <div>
          <Label htmlFor="display_name">Display name</Label>
          <Input id="display_name" name="display_name" required maxLength={40} />
        </div>

        <div>
          <Label htmlFor="area_id">Area on Quadra</Label>
          <select
            id="area_id"
            name="area_id"
            required
            className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1 text-sm"
          >
            <option value="">Choose…</option>
            {areas?.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        <Button type="submit" className="w-full">Continue</Button>
      </form>
    </main>
  );
}
