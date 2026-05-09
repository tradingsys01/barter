import { createHmac, timingSafeEqual } from "node:crypto";

type Purpose = "chat_email";

function secret(): Buffer {
  const s = process.env.NOTIFY_TOKEN_SECRET;
  if (!s) throw new Error("NOTIFY_TOKEN_SECRET is not set");
  return Buffer.from(s, "utf8");
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Buffer | null {
  try {
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
    return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
  } catch {
    return null;
  }
}

export function signUnsubscribeToken(userId: string, purpose: Purpose): string {
  const payload = `${userId}:${purpose}`;
  const sig = createHmac("sha256", secret()).update(payload).digest();
  return `${b64url(Buffer.from(payload, "utf8"))}.${b64url(sig)}`;
}

export function verifyUnsubscribeToken(token: string, purpose: Purpose): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const payloadBuf = fromB64url(parts[0]);
  const sigBuf = fromB64url(parts[1]);
  if (!payloadBuf || !sigBuf) return null;
  const expected = createHmac("sha256", secret()).update(payloadBuf).digest();
  if (expected.length !== sigBuf.length) return null;
  if (!timingSafeEqual(expected, sigBuf)) return null;
  const [userId, p] = payloadBuf.toString("utf8").split(":");
  if (!userId || p !== purpose) return null;
  return userId;
}
