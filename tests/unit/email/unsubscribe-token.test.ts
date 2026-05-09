import { describe, expect, it, beforeEach } from "vitest";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "@/lib/email/unsubscribe-token";

beforeEach(() => {
  process.env.NOTIFY_TOKEN_SECRET = "test-secret-do-not-use-in-prod";
});

describe("unsubscribe token", () => {
  it("round-trips a user id for the chat_email purpose", () => {
    const token = signUnsubscribeToken("user-abc", "chat_email");
    expect(verifyUnsubscribeToken(token, "chat_email")).toBe("user-abc");
  });

  it("rejects a tampered token", () => {
    const token = signUnsubscribeToken("user-abc", "chat_email");
    const tampered = token.slice(0, -2) + (token.endsWith("A") ? "B" : "A");
    expect(verifyUnsubscribeToken(tampered, "chat_email")).toBeNull();
  });

  it("rejects a token signed for a different purpose", () => {
    const token = signUnsubscribeToken("user-abc", "marketing" as any);
    expect(verifyUnsubscribeToken(token, "chat_email")).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(verifyUnsubscribeToken("not-a-token", "chat_email")).toBeNull();
    expect(verifyUnsubscribeToken("", "chat_email")).toBeNull();
  });

  it("throws if NOTIFY_TOKEN_SECRET is unset when signing", () => {
    delete process.env.NOTIFY_TOKEN_SECRET;
    expect(() => signUnsubscribeToken("user-abc", "chat_email")).toThrow(/NOTIFY_TOKEN_SECRET/);
  });
});
