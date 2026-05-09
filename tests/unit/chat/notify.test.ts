import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const sendEmailMock = vi.fn();
vi.mock("@/lib/email/resend", () => ({ sendEmail: sendEmailMock }));

const supabaseState: {
  chat: any;
  recipient: any;
  sender: any;
  conditionalUpdateAffected: number;
  resetCalls: number;
} = {
  chat: null,
  recipient: null,
  sender: null,
  conditionalUpdateAffected: 1,
  resetCalls: 0,
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from(table: string) {
      const builder: any = {
        _table: table,
        _select: null as string | null,
        _eq: [] as Array<[string, unknown]>,
        _update: null as Record<string, unknown> | null,
        select(cols: string) { builder._select = cols; return builder; },
        update(patch: Record<string, unknown>) { builder._update = patch; return builder; },
        eq(col: string, val: unknown) { builder._eq.push([col, val]); return builder; },
        or() { return builder; },
        async maybeSingle() {
          if (table === "chats") return { data: supabaseState.chat, error: null };
          if (table === "users")  {
            const idEq = builder._eq.find((e: any) => e[0] === "id");
            if (idEq && supabaseState.recipient && idEq[1] === supabaseState.recipient.id) {
              return { data: supabaseState.recipient, error: null };
            }
            if (idEq && supabaseState.sender && idEq[1] === supabaseState.sender.id) {
              return { data: supabaseState.sender, error: null };
            }
            return { data: null, error: null };
          }
          if (table === "listings") return { data: { title: "Kayak" }, error: null };
          return { data: null, error: null };
        },
        async then(resolve: (v: unknown) => unknown) {
          if (builder._update && table === "chats") {
            // Reset path: clearing the cooldown timestamp to null after a send failure.
            if ((builder._update as any).last_email_sent_at_initiator === null ||
                (builder._update as any).last_email_sent_at_owner === null) {
              supabaseState.resetCalls++;
              return resolve({ data: [{ id: "c1" }], error: null });
            }
            // Claim path: conditional UPDATE that sets the timestamp.
            return resolve({
              data: Array.from({ length: supabaseState.conditionalUpdateAffected }, () => ({ id: "c1" })),
              error: null,
            });
          }
          return resolve({ data: null, error: null });
        },
      };
      return builder;
    },
  }),
}));

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.NOTIFY_TOKEN_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.APP_URL = "https://barter.test";
  process.env.EMAIL_FROM = "Barter <notify@barter.test>";
  process.env.EMAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "re_test";
  delete process.env.CHAT_EMAIL_COOLDOWN_MINUTES;

  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue(undefined);
  supabaseState.chat = {
    id: "c1",
    initiator_id: "u-init",
    owner_id: "u-own",
    listing_id: "l1",
    last_email_sent_at_initiator: null,
    last_email_sent_at_owner: null,
  };
  supabaseState.recipient = {
    id: "u-own",
    email: "owner@example.com",
    notify_chat_email: true,
  };
  supabaseState.sender = { id: "u-init", email: "init@example.com", notify_chat_email: true };
  supabaseState.conditionalUpdateAffected = 1;
  supabaseState.resetCalls = 0;
});

afterEach(() => {
  vi.resetModules();
});

describe("maybeSendChatEmail — cooldown gate", () => {
  it("sends to the owner when initiator is the sender", async () => {
    const { maybeSendChatEmail } = await import("@/lib/chat/notify");
    supabaseState.recipient = { ...supabaseState.recipient, display_name: "Owner Olive" };
    supabaseState.sender = { ...supabaseState.sender, display_name: "Init Ivy" };
    await maybeSendChatEmail("c1", "u-init", "Hi, when can we meet?");
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const arg = sendEmailMock.mock.calls[0][0];
    expect(arg.to).toBe("owner@example.com");
    expect(arg.subject).toMatch(/Init Ivy/);
    expect(arg.text).toContain("Init Ivy");
    expect(arg.text).toContain("Hi, when can we meet?");
    expect(arg.text).toContain("Kayak");
    expect(arg.text).toContain("https://barter.test/chats/c1");
    expect(arg.headers?.["List-Unsubscribe"]).toMatch(/^<https:\/\/barter\.test\/unsubscribe\?token=/);
    expect(arg.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("sends to the initiator when owner is the sender", async () => {
    const { maybeSendChatEmail } = await import("@/lib/chat/notify");
    supabaseState.recipient = { id: "u-init", email: "init@example.com", notify_chat_email: true, display_name: "Init Ivy" };
    supabaseState.sender    = { id: "u-own",  email: "owner@example.com", notify_chat_email: true, display_name: "Owner Olive" };
    await maybeSendChatEmail("c1", "u-own", "Sure, Saturday at 10?");
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].to).toBe("init@example.com");
  });

  it("skips when recipient has notify_chat_email=false", async () => {
    supabaseState.recipient.notify_chat_email = false;
    const { maybeSendChatEmail } = await import("@/lib/chat/notify");
    await maybeSendChatEmail("c1", "u-init", "x");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("skips when last_email_sent_at_<side> is within cooldown", async () => {
    supabaseState.chat.last_email_sent_at_owner = new Date(Date.now() - 60_000).toISOString(); // 1 min ago
    const { maybeSendChatEmail } = await import("@/lib/chat/notify");
    await maybeSendChatEmail("c1", "u-init", "x");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("sends when last_email_sent_at_<side> is older than cooldown", async () => {
    supabaseState.chat.last_email_sent_at_owner = new Date(Date.now() - 30 * 60_000).toISOString(); // 30 min ago, default cooldown is 15
    const { maybeSendChatEmail } = await import("@/lib/chat/notify");
    await maybeSendChatEmail("c1", "u-init", "x");
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("skips when the conditional UPDATE returns 0 rows (race lost)", async () => {
    supabaseState.conditionalUpdateAffected = 0;
    const { maybeSendChatEmail } = await import("@/lib/chat/notify");
    await maybeSendChatEmail("c1", "u-init", "x");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("clears last_email_sent_at_<side> when sendEmail throws", async () => {
    sendEmailMock.mockRejectedValue(new Error("Resend 429: rate limit"));
    const errLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const { maybeSendChatEmail } = await import("@/lib/chat/notify");
    await maybeSendChatEmail("c1", "u-init", "x");
    expect(supabaseState.resetCalls).toBe(1);
    errLog.mockRestore();
  });

  it("truncates body over 500 chars with ellipsis", async () => {
    const long = "a".repeat(600);
    const { maybeSendChatEmail } = await import("@/lib/chat/notify");
    supabaseState.recipient = { ...supabaseState.recipient, display_name: "Owner Olive" };
    supabaseState.sender    = { ...supabaseState.sender,    display_name: "Init Ivy" };
    await maybeSendChatEmail("c1", "u-init", long);
    const text = sendEmailMock.mock.calls[0][0].text as string;
    expect(text).toContain("a".repeat(500) + "…");
    expect(text).not.toContain("a".repeat(501));
  });

  it("respects CHAT_EMAIL_COOLDOWN_MINUTES override", async () => {
    process.env.CHAT_EMAIL_COOLDOWN_MINUTES = "60"; // 60 min cooldown
    supabaseState.chat.last_email_sent_at_owner = new Date(Date.now() - 30 * 60_000).toISOString(); // 30 min ago
    const { maybeSendChatEmail } = await import("@/lib/chat/notify");
    await maybeSendChatEmail("c1", "u-init", "x");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("skips with an error log when APP_URL is unset", async () => {
    delete process.env.APP_URL;
    const errLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const { maybeSendChatEmail } = await import("@/lib/chat/notify");
    await maybeSendChatEmail("c1", "u-init", "x");
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(errLog).toHaveBeenCalledWith(
      expect.stringContaining("APP_URL"),
      expect.any(Object),
    );
    errLog.mockRestore();
  });
});
