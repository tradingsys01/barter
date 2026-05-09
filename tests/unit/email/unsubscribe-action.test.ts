import { describe, expect, it, vi, beforeEach } from "vitest";

const updates: Array<{ table: string; patch: Record<string, unknown>; id: string }> = [];

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from(table: string) {
      const builder: any = {
        _eq: [] as Array<[string, unknown]>,
        update(p: Record<string, unknown>) { builder._patch = p; return builder; },
        eq(c: string, v: unknown) { builder._eq.push([c, v]); return builder; },
        then(resolve: (v: unknown) => unknown) {
          const idEq = builder._eq.find((e: any) => e[0] === "id");
          updates.push({ table, patch: builder._patch, id: String(idEq?.[1]) });
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
  updates.length = 0;
});

describe("setChatEmailPreference", () => {
  it("flips the flag for a valid token", async () => {
    const { signUnsubscribeToken } = await import("@/lib/email/unsubscribe-token");
    const { setChatEmailPreference } = await import("@/app/unsubscribe/actions");
    const token = signUnsubscribeToken("u-123", "chat_email");
    const result = await setChatEmailPreference(token, false);
    expect(result.ok).toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe("users");
    expect(updates[0].id).toBe("u-123");
    expect(updates[0].patch).toEqual({ notify_chat_email: false });
  });

  it("rejects a tampered token without writing", async () => {
    const { setChatEmailPreference } = await import("@/app/unsubscribe/actions");
    const result = await setChatEmailPreference("not-a-real-token", false);
    expect(result.ok).toBe(false);
    expect(updates).toHaveLength(0);
  });
});
