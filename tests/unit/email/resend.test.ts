import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.EMAIL_FROM = "Barter <notify@example.com>";
  delete process.env.EMAIL_PROVIDER;
  delete process.env.RESEND_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.EMAIL_PROVIDER;
  delete process.env.RESEND_API_KEY;
});

describe("sendEmail", () => {
  it("no-ops with a warn log when EMAIL_PROVIDER is unset", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sendEmail } = await import("@/lib/email/resend");
    await sendEmail({ to: "u@example.com", subject: "x", text: "y" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("EMAIL_PROVIDER"));
    warn.mockRestore();
  });

  it("posts to Resend with a Bearer token when provider=resend", async () => {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "re_test_key";
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const { sendEmail } = await import("@/lib/email/resend");
    await sendEmail({
      to: "u@example.com",
      subject: "Hello",
      text: "body",
      headers: { "List-Unsubscribe": "<https://x/u>" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer re_test_key",
      "Content-Type": "application/json",
    });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      from: "Barter <notify@example.com>",
      to: "u@example.com",
      subject: "Hello",
      text: "body",
      headers: { "List-Unsubscribe": "<https://x/u>" },
    });
  });

  it("throws on Resend non-2xx so callers can reset the gate flag", async () => {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "re_test_key";
    fetchMock.mockResolvedValue(new Response("rate limit", { status: 429 }));
    const { sendEmail } = await import("@/lib/email/resend");
    await expect(
      sendEmail({ to: "u@example.com", subject: "x", text: "y" }),
    ).rejects.toThrow(/429/);
  });

  it("throws if RESEND_API_KEY missing under provider=resend", async () => {
    process.env.EMAIL_PROVIDER = "resend";
    const { sendEmail } = await import("@/lib/email/resend");
    await expect(
      sendEmail({ to: "u@example.com", subject: "x", text: "y" }),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });
});
