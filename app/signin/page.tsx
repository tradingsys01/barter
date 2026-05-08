import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SignInParams = {
  sent?: string;
  error?: string;
  email?: string;
  verify_error?: string;
};

export default function SignInPage({
  searchParams,
}: { searchParams: Promise<SignInParams> }) {
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
    if (error) redirect(`/signin?error=1`);
    redirect(`/signin?sent=1&email=${encodeURIComponent(email)}`);
  }

  async function verify(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const token = String(formData.get("token") ?? "").trim();
    const { redirect } = await import("next/navigation");
    if (!email || !/^\d{6}$/.test(token)) {
      redirect(`/signin?sent=1&email=${encodeURIComponent(email)}&verify_error=1`);
    }
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    if (error) {
      redirect(`/signin?sent=1&email=${encodeURIComponent(email)}&verify_error=1`);
    }
    redirect(`/me`);
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-2">Sign in</h1>
        <p className="text-sm text-zinc-600 mb-6">
          We&apos;ll email you a one-tap link or a 6-digit code. No password.
        </p>
        <SignInResolver searchParams={searchParams} />
        <form action={send} className="space-y-3">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" name="email" required autoComplete="email" />
          </div>
          <Button type="submit" className="w-full">Send link</Button>
        </form>
        <CodeForm searchParams={searchParams} verify={verify} />
      </div>
    </main>
  );
}

async function SignInResolver({
  searchParams,
}: { searchParams: Promise<SignInParams> }) {
  const params = await searchParams;
  if (params.verify_error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 text-red-800 p-3 text-sm mb-4">
        That code didn&apos;t work. It may have expired — try requesting a fresh link.
      </div>
    );
  }
  if (params.sent) {
    return (
      <div className="rounded border border-green-200 bg-green-50 text-green-800 p-3 text-sm mb-4">
        Check your inbox (and spam folder). Click the link, or paste the code below.
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

async function CodeForm({
  searchParams,
  verify,
}: {
  searchParams: Promise<SignInParams>;
  verify: (formData: FormData) => Promise<void>;
}) {
  const params = await searchParams;
  if (!params.sent || !params.email) return null;
  return (
    <form action={verify} className="space-y-3 mt-6 pt-6 border-t border-zinc-200">
      <p className="text-sm text-zinc-600">Or enter the 6-digit code from the email:</p>
      <input type="hidden" name="email" value={params.email} />
      <div>
        <Label htmlFor="token">Code</Label>
        <Input
          id="token"
          name="token"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
        />
      </div>
      <Button type="submit" variant="outline" className="w-full">Verify code</Button>
    </form>
  );
}
