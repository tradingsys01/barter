import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignInPage({
  searchParams,
}: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  async function send(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    if (!email) return;
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      },
    });
    const { redirect } = await import("next/navigation");
    redirect(error ? `/signin?error=1` : `/signin?sent=1`);
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-2">Sign in</h1>
        <p className="text-sm text-zinc-600 mb-6">
          We'll email you a one-tap link. No password.
        </p>
        <SignInResolver searchParams={searchParams} />
        <form action={send} className="space-y-3">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" name="email" required autoComplete="email" />
          </div>
          <Button type="submit" className="w-full">Send link</Button>
        </form>
      </div>
    </main>
  );
}

async function SignInResolver({
  searchParams,
}: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const params = await searchParams;
  if (params.sent) {
    return (
      <div className="rounded border border-green-200 bg-green-50 text-green-800 p-3 text-sm mb-4">
        Check your inbox (and spam folder) for the sign-in link.
      </div>
    );
  }
  if (params.error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 text-red-800 p-3 text-sm mb-4">
        Something went wrong sending the link. Try again in a minute.
      </div>
    );
  }
  return null;
}
