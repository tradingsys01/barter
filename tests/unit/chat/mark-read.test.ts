import { describe, expect, it, vi } from "vitest";

const updates: Array<{ table: string; patch: Record<string, unknown>; id: string }> = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(table: string) {
      const builder: any = {
        _eq: [] as Array<[string, unknown]>,
        _patch: null as Record<string, unknown> | null,
        select() { return builder; },
        update(p: Record<string, unknown>) { builder._patch = p; return builder; },
        eq(c: string, v: unknown) { builder._eq.push([c, v]); return builder; },
        async maybeSingle() {
          return { data: { initiator_id: "u-init", owner_id: "u-own" }, error: null };
        },
        then(resolve: (v: unknown) => unknown) {
          if (builder._patch) {
            const idEq = builder._eq.find((e: any) => e[0] === "id");
            updates.push({ table, patch: builder._patch, id: String(idEq?.[1]) });
          }
          return resolve({ data: null, error: null });
        },
      };
      return builder;
    },
  }),
}));

describe("markChatRead", () => {
  it("clears email_pending_initiator when the viewer is the initiator", async () => {
    updates.length = 0;
    const { markChatRead } = await import("@/lib/chat/queries");
    await markChatRead("c1", "u-init");
    expect(updates).toHaveLength(1);
    expect(updates[0].patch).toMatchObject({ email_pending_initiator: false });
    expect(updates[0].patch.initiator_last_read_at).toEqual(expect.any(String));
    expect(updates[0].patch).not.toHaveProperty("email_pending_owner");
  });

  it("clears email_pending_owner when the viewer is the owner", async () => {
    updates.length = 0;
    const { markChatRead } = await import("@/lib/chat/queries");
    await markChatRead("c1", "u-own");
    expect(updates).toHaveLength(1);
    expect(updates[0].patch).toMatchObject({ email_pending_owner: false });
    expect(updates[0].patch.owner_last_read_at).toEqual(expect.any(String));
  });

  it("no-ops when the viewer is neither party", async () => {
    updates.length = 0;
    const { markChatRead } = await import("@/lib/chat/queries");
    await markChatRead("c1", "stranger");
    expect(updates).toHaveLength(0);
  });
});
