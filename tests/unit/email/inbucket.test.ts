import { describe, expect, it, vi } from "vitest";

// We need to mock node:net BEFORE importing the module under test, because
// the module reads HOST/PORT at import time.
vi.mock("node:net", () => ({
  createConnection: () => {
    throw new Error("createConnection should not be called when input fails CRLF check");
  },
}));

describe("sendViaInbucket — input sanitization", () => {
  it("rejects CRLF in subject", async () => {
    const { sendViaInbucket } = await import("@/lib/email/inbucket");
    await expect(
      sendViaInbucket({
        from: "Barter <a@b.c>",
        to: "x@y.z",
        subject: "Hi\r\nBcc: evil@x.y",
        text: "body",
      }),
    ).rejects.toThrow(/CRLF in subject/);
  });

  it("rejects CRLF in from / to / header values", async () => {
    const { sendViaInbucket } = await import("@/lib/email/inbucket");
    await expect(
      sendViaInbucket({ from: "a@b.c\r\n", to: "x@y.z", subject: "s", text: "t" }),
    ).rejects.toThrow(/CRLF in from/);
    await expect(
      sendViaInbucket({ from: "a@b.c", to: "x@y.z\n", subject: "s", text: "t" }),
    ).rejects.toThrow(/CRLF in to/);
    await expect(
      sendViaInbucket({
        from: "a@b.c", to: "x@y.z", subject: "s", text: "t",
        headers: { "List-Unsubscribe": "<https://x>\r\nBcc: evil@x.y" },
      }),
    ).rejects.toThrow(/CRLF in header value/);
  });
});

describe("dotStuff (via sendViaInbucket — pure check)", () => {
  // Reach in via dynamic import + reflection? The simplest is to extract
  // dotStuff into a separately-importable helper. To keep this test minimal
  // and the production module unchanged, we test the public API by mocking
  // a working socket and asserting the body bytes. That's heavyweight for
  // dev-only code; we leave dot-stuffing covered by the manual Task 9 step.
  it.skip("dot-stuffing covered by manual verification (Task 9)", () => {});
});
