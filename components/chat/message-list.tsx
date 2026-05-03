import type { Message } from "@/lib/chat/queries";

export function MessageList({ messages, viewerId }: { messages: Message[]; viewerId: string }) {
  if (messages.length === 0) {
    return <p className="text-center text-sm text-zinc-500">No messages yet — say hi.</p>;
  }
  return (
    <ul className="space-y-2">
      {messages.map((m) => {
        const mine = m.sender_id === viewerId;
        return (
          <li key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                "max-w-[75%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm " +
                (mine
                  ? "bg-emerald-700 text-white rounded-br-sm"
                  : "bg-zinc-100 text-zinc-900 rounded-bl-sm")
              }
            >
              {m.body}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
