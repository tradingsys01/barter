import { requireCompleteProfile } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";

export default async function MePage() {
  const { user, profile } = await requireCompleteProfile();
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Hi {profile.display_name}</h1>
        <p className="text-sm text-zinc-600">Signed in as {user.email}.</p>
        <p className="text-sm text-zinc-500">
          Listings, chat, and ratings are coming next. For now, you're set up.
        </p>
        <SignOutButton />
      </div>
    </main>
  );
}
