import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getProfileWithClient } from "@/lib/auth";

// Use a direct Supabase client (no Next.js cookies context needed)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

describe("getProfile", () => {
  it("returns null for an unknown user id", async () => {
    const profile = await getProfileWithClient(supabase, "00000000-0000-0000-0000-000000000000");
    expect(profile).toBeNull();
  });
});
