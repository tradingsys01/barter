import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/resend";
import { signUnsubscribeToken } from "@/lib/email/unsubscribe-token";

const MAX_BODY_CHARS = 500;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + "…";
}

export async function maybeSendChatEmail(
  chatId: string,
  senderId: string,
  body: string,
): Promise<void> {
  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    console.error("[chat-email] APP_URL is not set; skipping send", { chatId, senderId });
    return;
  }

  const db = admin();

  const { data: chat } = await db
    .from("chats")
    .select("id, initiator_id, owner_id, listing_id")
    .eq("id", chatId)
    .maybeSingle();
  if (!chat) return;

  const recipientId =
    senderId === chat.initiator_id ? chat.owner_id : chat.initiator_id;

  const { data: rec } = await db
    .from("users")
    .select("id, email, display_name, notify_chat_email")
    .eq("id", recipientId)
    .maybeSingle();
  if (!rec || !rec.email) return;
  if (rec.notify_chat_email === false) return;

  const [{ data: sender }, { data: listing }] = await Promise.all([
    db.from("users").select("id, display_name").eq("id", senderId).maybeSingle(),
    db.from("listings").select("title").eq("id", chat.listing_id).maybeSingle(),
  ]);

  const senderName = sender?.display_name ?? "Someone";
  const recipientName = rec.display_name ?? "there";
  const listingTitle = listing?.title ?? "your listing";
  const token = signUnsubscribeToken(recipientId, "chat_email");
  const unsubUrl = `${appUrl}/unsubscribe?token=${encodeURIComponent(token)}`;
  const chatUrl = `${appUrl}/chats/${chatId}`;
  const truncated = truncate(body, MAX_BODY_CHARS);

  const subject = `New message from ${senderName} on Barter`;
  const text =
    `Hi ${recipientName},\n\n` +
    `${senderName} sent you a message about your listing\n` +
    `"${listingTitle}":\n\n` +
    `  ${truncated}\n\n` +
    `Reply on Barter:\n${chatUrl}\n\n` +
    `—\nYou're getting this because you have a chat on Barter.\n` +
    `Unsubscribe from chat emails: ${unsubUrl}\n`;

  try {
    await sendEmail({
      to: rec.email,
      subject,
      text,
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  } catch (err) {
    console.error("[chat-email] send failed", { chatId, recipientId, err: String(err) });
  }
}
