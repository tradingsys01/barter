"use client";

import { useState, useTransition } from "react";
import { createReport } from "@/lib/reports/actions";

type Props = {
  targetType: "listing" | "user" | "message";
  targetId: string;
};

export function ReportButton({ targetType, targetId }: Props) {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();

  if (submitted) return <span className="text-xs text-zinc-500">Report sent — thanks.</span>;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-zinc-500 underline hover:text-zinc-800"
      >
        Report
      </button>
    );
  }

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          await createReport(formData);
          setSubmitted(true);
        });
      }}
      className="space-y-2 rounded-lg border bg-white p-3"
    >
      <input type="hidden" name="target_type" value={targetType} />
      <input type="hidden" name="target_id" value={targetId} />
      <label htmlFor="report-reason" className="block text-xs font-medium">Why are you reporting this?</label>
      <textarea
        id="report-reason"
        name="reason"
        required
        minLength={3}
        maxLength={1000}
        rows={3}
        className="w-full rounded border px-2 py-1 text-xs"
        placeholder="Spam, prohibited goods, abusive language, …"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-emerald-700 px-3 py-1 text-xs text-white disabled:opacity-50"
        >
          {pending ? "Sending…" : "Submit report"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded border px-3 py-1 text-xs"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
