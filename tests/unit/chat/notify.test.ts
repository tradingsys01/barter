import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const sendEmailMock = vi.fn();
vi.mock("@/lib/email/resend", () => ({ sendEmail: sendEmailMock }));

const supabaseState: {
  chat: any;
  recipient: any;
  sender: any;
} = { chat: null, recipient: null, sender: null };

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from(table: string) {
      const builder: any = {
        _eq: [] as Array<[string, unknown]>,
        select() { return builder; },
        eq(col: string, val: unknown) { builder._eq.push([col, val]); return builder; },
        async maybeSingle() {
          if (table === "chats") return { data: supabaseState.chat, error: null };
          if (table === "users") {
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

  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue(undefined);
  supabaseState.chat = {
    id: "c1",
    initiator_id: "u-init",
    owner_id: "u-own",
    listing_id: "l1",
  };
  supabaseState.recipient = {
    id: "u-own",
    email: "owner@example.com",
    notify_chat_email: true,
  };
  supabaseState.sender = { id: "u-init", email: "init@example.com", notify_chat_email: true };
});

afterEach(() => {
  vi.resetModules();
});

describe("maybeSendChatEmail", () => {
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

  it("does not throw when sendEmail fails (failure is swallowed and logged)", async () => {
    sendEmailMock.mockRejectedValue(new Error("Resend 429: rate limit"));
    const errLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const { maybeSendChatEmail } = await import("@/lib/chat/notify");
    await expect(maybeSendChatEmail("c1", "u-init", "x")).resolves.toBeUndefined();
    expect(errLog).toHaveBeenCalled();
    errLog.mockRestore();
  });
});
