/**
 * Happy-path e2e: magic-link signup flow
 *
 * Since this environment has no working SMTP (supabase-mail DNS doesn't resolve),
 * we use the Supabase Admin API's `generate_link` endpoint to obtain the magic
 * link directly. This is the documented approach for CI/CD environments without
 * a real mail server.
 *
 * The generated link is an implicit-flow URL (hash fragment #access_token=…).
 * Our /auth/callback page is a client component that calls
 * supabase.auth.getSession(), which detects the hash fragment automatically
 * (detectSessionInUrl: true is the default) and stores the session.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:8000";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q";

test("magic-link signup flow lands on /onboarding then /me", async ({ page, request }) => {
  const email = `quadra-test-${Date.now()}@example.com`;

  // ── 1. Create a confirmed user via Admin API ──────────────────────────────
  const createResp = await request.post(`${SUPABASE_URL}/auth/v1/admin/users`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    data: { email, email_confirm: true },
  });
  expect(createResp.ok(), `create user failed: ${await createResp.text()}`).toBe(true);
  const { id: userId } = await createResp.json();

  // ── 2. Generate magic link via Admin API ──────────────────────────────────
  const link = await getMagicLink(email, request);
  expect(link, "magic link should be a non-empty string").toBeTruthy();

  // ── 3. Follow the magic link — /auth/callback detects the hash fragment ───
  await page.goto(link);
  // The verify endpoint redirects to /auth/callback#access_token=...
  // Wait for the client component to redirect to /me
  await expect(page).toHaveURL(/\/(me|onboarding)/, { timeout: 15_000 });

  // ── 4. Complete onboarding if redirected there ────────────────────────────
  if (page.url().includes("/onboarding")) {
    await page.getByLabel(/display name/i).fill("Test User");
    await page.locator("select#area_id").selectOption({ label: "Quathiaski Cove" });
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page).toHaveURL(/\/me/, { timeout: 10_000 });
  }

  // ── 5. Verify /me page content ────────────────────────────────────────────
  await expect(page.getByText(/hi test user/i)).toBeVisible();

  // ── 6. Cleanup: delete test user ─────────────────────────────────────────
  await request.delete(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
});

/**
 * Uses the Supabase Admin API to generate a magic link directly.
 * Works in any environment — no mail server required.
 */
async function getMagicLink(email: string, request: APIRequestContext): Promise<string> {
  const resp = await request.post(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    data: {
      type: "magiclink",
      email,
      redirect_to: "http://localhost:3000/auth/callback",
    },
  });

  if (!resp.ok()) {
    throw new Error(`generate_link failed (${resp.status()}): ${await resp.text()}`);
  }

  const body = await resp.json();
  const actionLink: string = body.action_link ?? "";
  if (!actionLink) throw new Error("generate_link returned no action_link");
  return actionLink;
}
