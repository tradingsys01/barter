"use client";
/**
 * /auth/callback — handles both Supabase auth flows:
 *
 * 1. PKCE flow (email magic link from signInWithOtp): arrives as
 *    /auth/callback?code=<auth_code>
 *    The SSR browser client (flowType: pkce) exchanges the code for a session.
 *
 * 2. Implicit flow (admin generate_link / direct verify URL): arrives as
 *    /auth/callback#access_token=<token>&refresh_token=<token>&...
 *    We parse the hash manually and call setSession() to hydrate the session,
 *    because createBrowserClient uses flowType:pkce and ignores hash fragments.
 *
 * After auth, we redirect to /me (middleware redirects to /onboarding if needed).
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    // Parse hash fragment for implicit-flow tokens
    const hash = window.location.hash.slice(1);
    const hashParams: Record<string, string> = {};
    hash.split("&").forEach((part) => {
      const [k, v] = part.split("=");
      if (k) hashParams[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
    });

    const { access_token, refresh_token } = hashParams;

    if (access_token && refresh_token) {
      // Implicit flow: manually set the session using the tokens from the hash.
      // After setSession writes the auth cookies, do a full page navigation
      // so the Next.js server components receive the freshly-set cookies.
      supabase.auth
        .setSession({ access_token, refresh_token })
        .then(({ error }) => {
          if (error) {
            window.location.href = "/signin?error=1";
          } else {
            window.location.href = "/me";
          }
        });
      return;
    }

    // PKCE flow: the SSR browser client handles ?code= automatically via
    // onAuthStateChange (SIGNED_IN fires after code exchange).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        subscription.unsubscribe();
        clearTimeout(timeout);
        router.replace("/me");
      } else if (event === "INITIAL_SESSION" && !session) {
        subscription.unsubscribe();
        clearTimeout(timeout);
        router.replace("/signin?error=1");
      }
    });

    const timeout = setTimeout(() => {
      subscription.unsubscribe();
      router.replace("/signin?error=1");
    }, 10000);

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-zinc-500">Signing in…</p>
    </main>
  );
}
