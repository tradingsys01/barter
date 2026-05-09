import { redirect } from "next/navigation";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe-token";
import { setChatEmailPreference } from "./actions";

type Props = { searchParams: Promise<{ token?: string; done?: string; on?: string }> };

export default async function UnsubscribePage({ searchParams }: Props) {
  const params = await searchParams;
  const token = params.token ?? "";
  const valid = token ? verifyUnsubscribeToken(token, "chat_email") !== null : false;

  if (!valid) {
    return (
      <main className="mx-auto max-w-md p-8">
        <h1 className="text-xl font-semibold">Link invalid or expired</h1>
        <p className="mt-2 text-sm text-zinc-600">
          This unsubscribe link could not be verified. Sign in to{" "}
          <a className="underline" href="/me">your account</a> to manage email preferences.
        </p>
      </main>
    );
  }

  if (params.done === "1") {
    const enabled = params.on === "1";
    return (
      <main className="mx-auto max-w-md p-8 space-y-4">
        <h1 className="text-xl font-semibold">
          {enabled ? "Chat emails re-enabled" : "Unsubscribed from chat emails"}
        </h1>
        <p className="text-sm text-zinc-600">
          {enabled
            ? "You'll get an email when someone messages you about a swap."
            : "You won't get emails for new chat messages anymore."}
        </p>
        <form action={async () => {
          "use server";
          await setChatEmailPreference(token, !enabled);
          const next = !enabled ? "1" : "0";
          redirect(`/unsubscribe?token=${encodeURIComponent(token)}&done=1&on=${next}`);
        }}>
          <button className="text-sm underline" type="submit">
            {enabled ? "Unsubscribe again" : "Re-enable chat emails"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-8 space-y-4">
      <h1 className="text-xl font-semibold">Unsubscribe from chat emails?</h1>
      <p className="text-sm text-zinc-600">
        We'll stop emailing you when someone messages you about a swap. You can re-enable
        anytime from this page.
      </p>
      <form action={async () => {
        "use server";
        await setChatEmailPreference(token, false);
        redirect(`/unsubscribe?token=${encodeURIComponent(token)}&done=1&on=0`);
      }}>
        <button
          className="rounded bg-zinc-900 px-4 py-2 text-sm text-white"
          type="submit"
        >
          Unsubscribe
        </button>
      </form>
    </main>
  );
}
