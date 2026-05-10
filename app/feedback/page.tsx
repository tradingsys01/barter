"use client";

import { useState, useTransition } from "react";
import { submitFeedback } from "@/lib/feedback/actions";

export default function FeedbackPage() {
  const [pending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await submitFeedback(formData);
      if (result.success) {
        setSubmitted(true);
      } else {
        setError(result.error ?? "Something went wrong");
      }
    });
  }

  if (submitted) {
    return (
      <main className="mx-auto max-w-xl space-y-6 p-6">
        <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-8 text-center">
          <div className="mb-4 text-4xl">🙏</div>
          <h1 className="mb-2 text-xl font-semibold text-emerald-900">Thank you!</h1>
          <p className="text-emerald-700">Your feedback has been submitted. We appreciate you taking the time to help improve Quadra Barter.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Send feedback</h1>
        <p className="mt-1 text-zinc-600">Help us improve Quadra Barter with your suggestions, bug reports, or ideas.</p>
      </div>

      <form action={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="type" className="block text-sm font-medium text-zinc-700">
            What kind of feedback?
          </label>
          <select
            id="type"
            name="type"
            required
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="suggestion">💡 Suggestion or idea</option>
            <option value="bug">🐛 Bug report</option>
            <option value="other">💬 Other feedback</option>
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="email" className="block text-sm font-medium text-zinc-700">
            Email <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="your@email.com"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          <p className="text-xs text-zinc-500">If you'd like us to follow up with you</p>
        </div>

        <div className="space-y-1">
          <label htmlFor="message" className="block text-sm font-medium text-zinc-700">
            Your feedback
          </label>
          <textarea
            id="message"
            name="message"
            required
            minLength={10}
            maxLength={2000}
            rows={5}
            placeholder="Tell us what's on your mind..."
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? "Submitting..." : "Submit feedback"}
        </button>
      </form>
    </main>
  );
}
