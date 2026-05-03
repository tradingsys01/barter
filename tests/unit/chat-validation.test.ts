import { describe, expect, it } from "vitest";
import { sendMessageSchema } from "@/lib/chat/validation";

describe("sendMessageSchema", () => {
  it("accepts a normal message", () => {
    const r = sendMessageSchema.safeParse({
      chat_id: "11111111-1111-1111-1111-111111111111",
      body: "Sounds good. Tomorrow at 4?",
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty body", () => {
    const r = sendMessageSchema.safeParse({
      chat_id: "11111111-1111-1111-1111-111111111111",
      body: "   ",
    });
    expect(r.success).toBe(false);
  });

  it("rejects body over 4000 chars", () => {
    const r = sendMessageSchema.safeParse({
      chat_id: "11111111-1111-1111-1111-111111111111",
      body: "x".repeat(4001),
    });
    expect(r.success).toBe(false);
  });

  it("trims body", () => {
    const r = sendMessageSchema.safeParse({
      chat_id: "11111111-1111-1111-1111-111111111111",
      body: "  hello  ",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.body).toBe("hello");
  });
});
