import { createClient } from "@/lib/supabase/server";

export type ChatListItem = {
  id: string;
  listing_id: string;
  listing_title: string;
  listing_slug: string;
  cover_path: string | null;
  other_party: { id: string; display_name: string | null };
  last_message_at: string;
  last_message_preview: string | null;
};

export async function listMyChats(userId: string): Promise<ChatListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chats")
    .select(`
      id, listing_id, last_message_at, initiator_id, owner_id,
      listing:listing_id ( id, title, slug, listing_images ( path, sort_order ) ),
      initiator:initiator_id ( id, display_name ),
      owner:owner_id ( id, display_name ),
      messages ( body, created_at )
    `)
    .order("last_message_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row: any) => {
    const cover = (row.listing?.listing_images ?? [])
      .slice()
      .sort((a: any, b: any) => a.sort_order - b.sort_order)[0]?.path ?? null;

    const otherParty = row.initiator_id === userId ? row.owner : row.initiator;

    const lastMsg = (row.messages ?? [])
      .slice()
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

    return {
      id: row.id,
      listing_id: row.listing_id,
      listing_title: row.listing?.title ?? "",
      listing_slug: row.listing?.slug ?? "",
      cover_path: cover,
      other_party: {
        id: otherParty?.id ?? "",
        display_name: otherParty?.display_name ?? null,
      },
      last_message_at: row.last_message_at,
      last_message_preview: lastMsg?.body ? lastMsg.body.slice(0, 80) : null,
    };
  });
}

export type ChatHeader = {
  id: string;
  listing: { id: string; title: string; slug: string; owner_id: string; cover_path: string | null };
  initiator: { id: string; display_name: string | null };
  owner: { id: string; display_name: string | null };
};

export async function getChat(chatId: string): Promise<ChatHeader | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chats")
    .select(`
      id, initiator_id, owner_id,
      listing:listing_id ( id, title, slug, owner_id, listing_images ( path, sort_order ) ),
      initiator:initiator_id ( id, display_name ),
      owner:owner_id ( id, display_name )
    `)
    .eq("id", chatId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const cover = ((data as any).listing?.listing_images ?? [])
    .slice()
    .sort((a: any, b: any) => a.sort_order - b.sort_order)[0]?.path ?? null;

  return {
    id: data.id,
    listing: {
      id: (data as any).listing.id,
      title: (data as any).listing.title,
      slug: (data as any).listing.slug,
      owner_id: (data as any).listing.owner_id,
      cover_path: cover,
    },
    initiator: {
      id: (data as any).initiator.id,
      display_name: (data as any).initiator.display_name ?? null,
    },
    owner: {
      id: (data as any).owner.id,
      display_name: (data as any).owner.display_name ?? null,
    },
  };
}

export type Message = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export async function getMessages(chatId: string): Promise<Message[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Message[];
}
