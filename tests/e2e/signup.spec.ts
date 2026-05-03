/**
 * Happy-path e2e: magic-link signup flow.
 *
 * Drives the real PKCE flow end-to-end:
 *   /signin → request magic link → read email from Mailpit
 *   → click link → /auth/v1/verify → /auth/callback?code=…
 *   → exchangeCodeForSession (server) → /onboarding → /me
 *
 * Requires the Mailpit container from supabase/docker-compose.override.yml.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

test("magic-link signup flow lands on /onboarding then /me", async ({ page, request }) => {
  const email = `quadra-test-${Date.now()}@example.com`;

  // 1. Request the magic link.
  await page.goto("/signin");
  await page.getByLabel(/email/i).fill(email);
  await page.getByRole("button", { name: /send link/i }).click();
  await expect(page.getByText(/check your inbox/i)).toBeVisible();

  // 2. Read the email out of Mailpit and extract the magic link.
  const link = await waitForMagicLink(email, request);

  // 3. Follow the link — Supabase verifies, then redirects to our route handler
  //    which exchanges the code for a session and redirects onward.
  await page.goto(link);
  await expect(page).toHaveURL(/\/(me|onboarding)/, { timeout: 15_000 });

  // 4. New user → onboarding. Complete the form.
  if (page.url().includes("/onboarding")) {
    await page.getByLabel(/display name/i).fill("Test User");
    await page.locator("select#area_id").selectOption({ label: "Quathiaski Cove" });
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page).toHaveURL(/\/me/, { timeout: 10_000 });
  }

  await expect(page.getByText(/hi test user/i)).toBeVisible();
});

async function waitForMagicLink(
  email: string,
  request: APIRequestContext,
): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const search = await request.get(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    if (search.ok()) {
      const { messages = [] } = await search.json();
      if (messages.length > 0) {
        const msgId = messages[0].ID;
        const msgRes = await request.get(`${MAILPIT_URL}/api/v1/message/${msgId}`);
        const msg = await msgRes.json();
        const haystack = `${msg.HTML ?? ""}\n${msg.Text ?? ""}`;
        const match = haystack.match(/https?:\/\/localhost:8000\/auth\/v1\/verify[^\s"<]+/);
        if (match) return match[0];
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No magic link received in Mailpit for ${email}`);
}
