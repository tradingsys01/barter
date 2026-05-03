"use client";

import { useRef } from "react";
import { sendMessage } from "@/lib/chat/actions";

export function SendMessageForm({ chatId }: { chatId: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  async function action(formData: FormData) {
    await sendMessage(formData);
    formRef.current?.reset();
  }

  return (
    <form ref={formRef} action={action} className="flex items-end gap-2">
      <input type="hidden" name="chat_id" value={chatId} />
      <label className="sr-only" htmlFor="message-body">Message</label>
      <textarea
        id="message-body"
        name="body"
        required
        maxLength={4000}
        rows={2}
        placeholder="Type a message…"
        className="flex-1 resize-none rounded border px-3 py-2 text-sm"
      />
      <button type="submit" className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">
        Send
      </button>
    </form>
  );
}
