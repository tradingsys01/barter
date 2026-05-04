import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { listOpenReports } from "@/lib/admin/queries";
import { resolveReport, dismissReport, hideListing, banUser } from "@/lib/admin/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports — Admin", robots: { index: false, follow: false } };

export default async function AdminReportsPage() {
  await requireAdmin();
  const reports = await listOpenReports();

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Open reports</h1>
      {reports.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-zinc-500">
          Nothing to moderate. ☕
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {reports.map((r) => (
            <li key={r.id} className="space-y-2 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm">
                  <span className="font-medium">{r.reporter_name ?? "Someone"}</span>{" "}
                  reported a <span className="font-medium">{r.target_type}</span>:
                </p>
                <span className="text-xs text-zinc-500">{new Date(r.created_at).toLocaleString()}</span>
              </div>
              <p className="rounded bg-zinc-50 p-2 text-sm whitespace-pre-line">{r.reason}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {r.target_type === "listing" && (
                  <Link
                    href={`/l/${r.target_id}/_`}
                    target="_blank"
                    className="rounded border px-2 py-1"
                  >
                    Open listing
                  </Link>
                )}
                {r.target_type === "user" && (
                  <Link
                    href={`/u/${r.target_id}`}
                    target="_blank"
                    className="rounded border px-2 py-1"
                  >
                    Open profile
                  </Link>
                )}
                <form action={resolveReport}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="rounded bg-emerald-700 px-2 py-1 text-white">Resolve</button>
                </form>
                <form action={dismissReport}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="rounded border px-2 py-1">Dismiss</button>
                </form>
                {r.target_type === "listing" && (
                  <form action={hideListing}>
                    <input type="hidden" name="listing_id" value={r.target_id} />
                    <button className="rounded border border-red-300 px-2 py-1 text-red-700">
                      Hide listing
                    </button>
                  </form>
                )}
                {r.target_type === "user" && (
                  <form action={banUser}>
                    <input type="hidden" name="user_id" value={r.target_id} />
                    <button className="rounded border border-red-300 px-2 py-1 text-red-700">
                      Ban user
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
