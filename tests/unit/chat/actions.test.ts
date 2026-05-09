import { describe, expect, it, vi, beforeEach } from "vitest";

const sendChatEmailMock = vi.fn();
vi.mock("@/lib/chat/notify", () => ({ maybeSendChatEmail: sendChatEmailMock }));

const requireUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: requireUserMock }));

const afterMock = vi.fn((fn: () => unknown | Promise<unknown>) => fn());
vi.mock("next/server", () => ({ after: afterMock }));

const redirectMock = vi.fn((url: string) => {
  throw new Error(`__REDIRECT__:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const supabaseState: {
  listing: any;
  existingChat: any;
  newChatId: string;
} = { listing: null, existingChat: null, newChatId: "00000000-0000-0000-0000-000000000c01" };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(table: string) {
      const builder: any = {
        _eq: [] as Array<[string, unknown]>,
        _insert: null as Record<string, unknown> | null,
        select() { return builder; },
        insert(p: Record<string, unknown>) { builder._insert = p; return builder; },
        eq(col: string, val: unknown) { builder._eq.push([col, val]); return builder; },
        single() {
          if (builder._insert && table === "chats") {
            return Promise.resolve({ data: { id: supabaseState.newChatId }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        async maybeSingle() {
          if (table === "listings") return { data: supabaseState.listing, error: null };
          if (table === "chats")    return { data: supabaseState.existingChat, error: null };
          return { data: null, error: null };
        },
        async then(resolve: (v: unknown) => unknown) {
          if (builder._insert && table === "messages") return resolve({ data: null, error: null });
          return resolve({ data: null, error: null });
        },
      };
      return builder;
    },
  }),
}));

beforeEach(() => {
  sendChatEmailMock.mockReset();
  requireUserMock.mockReset();
  afterMock.mockClear();
  redirectMock.mockClear();
  requireUserMock.mockResolvedValue({ id: "00000000-0000-0000-0000-000000000001" });
  supabaseState.listing = {
    id: "00000000-0000-0000-0000-0000000000l1",
    owner_id: "00000000-0000-0000-0000-0000000000ow",
    title: "Kayak",
    status: "active",
    public_users: { display_name: "Owner Olive" },
  };
  supabaseState.existingChat = null;
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

async function callAndCatchRedirect(fn: () => Promise<void>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e: any) {
    const m = String(e?.message ?? "");
    if (m.startsWith("__REDIRECT__:")) return m.replace("__REDIRECT__:", "");
    throw e;
  }
}

describe("chat actions — email wiring", () => {
  it("startChat sends exactly one email to the listing owner with the greeting body", async () => {
    const { startChat } = await import("@/lib/chat/actions");
    await callAndCatchRedirect(() => startChat(fd({ listing_id: supabaseState.listing.id })));
    expect(sendChatEmailMock).toHaveBeenCalledTimes(1);
    const [chatId, senderId, body] = sendChatEmailMock.mock.calls[0];
    expect(chatId).toBe(supabaseState.newChatId);
    expect(senderId).toBe("00000000-0000-0000-0000-000000000001");
    expect(body).toContain("Owner Olive");
    expect(body).toContain("Kayak");
  });

  it("startChat does NOT send an email when redirecting to an existing chat", async () => {
    supabaseState.existingChat = { id: "00000000-0000-0000-0000-00000000ex01" };
    const { startChat } = await import("@/lib/chat/actions");
    await callAndCatchRedirect(() => startChat(fd({ listing_id: supabaseState.listing.id })));
    expect(sendChatEmailMock).not.toHaveBeenCalled();
  });

  it("sendMessage does NOT send an email (follow-up messages no longer notify)", async () => {
    const { sendMessage } = await import("@/lib/chat/actions");
    await sendMessage(
      fd({
        chat_id: "00000000-0000-0000-0000-000000000c01",
        body: "follow-up message",
      }),
    );
    expect(sendChatEmailMock).not.toHaveBeenCalled();
  });
});
