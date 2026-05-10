import { requireAdmin } from "@/lib/admin/auth";
import { listFeedback } from "@/lib/feedback/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Feedback — Admin", robots: { index: false, follow: false } };

const TYPE_LABELS = {
  bug: "🐛 Bug",
  suggestion: "💡 Suggestion",
  other: "💬 Other",
};

export default async function AdminFeedbackPage() {
  await requireAdmin();
  const items = await listFeedback();

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">User feedback</h1>
        <span className="text-sm text-zinc-500">{items.length} items</span>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-zinc-500">
          No feedback yet.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((f) => (
            <li key={f.id} className="space-y-2 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium">
                    {TYPE_LABELS[f.type]}
                  </span>
                  {f.email && (
                    <a href={`mailto:${f.email}`} className="text-sm text-emerald-700 hover:underline">
                      {f.email}
                    </a>
                  )}
                </div>
                <span className="text-xs text-zinc-500">
                  {new Date(f.created_at).toLocaleString()}
                </span>
              </div>
              <p className="whitespace-pre-line rounded bg-zinc-50 p-3 text-sm">{f.message}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
