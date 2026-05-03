import type { Page, APIRequestContext } from "@playwright/test";

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

/**
 * Drives the magic-link signup flow end-to-end against a real Supabase + Mailpit:
 *   /signin → request magic link → poll Mailpit → follow link → /auth/callback
 *   → if /onboarding, fill form → return the email used.
 *
 * Returns the unique email used so callers can correlate (e.g. server-side cleanup).
 */
export async function signInViaMailpit(
  page: Page,
  request: APIRequestContext,
  displayName: string,
): Promise<string> {
  const email = `quadra-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  await page.goto("/signin");
  await page.getByLabel(/email/i).fill(email);
  await page.getByRole("button", { name: /send link/i }).click();

  const link = await waitForMagicLink(email, request);
  await page.goto(link);
  await page.waitForURL(/\/(me|onboarding)/, { timeout: 15_000 });
  if (page.url().includes("/onboarding")) {
    await page.getByLabel(/display name/i).fill(displayName);
    await page.locator("select#area_id").selectOption({ label: "Quathiaski Cove" });
    await page.getByRole("button", { name: /continue/i }).click();
    await page.waitForURL(/\/me/, { timeout: 15_000 });
  }
  return email;
}

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
        const msgRes = await request.get(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`);
        const msg = await msgRes.json();
        // Prefer Text part — HTML escapes ampersands as &amp; which would
        // produce a malformed URL when passed to page.goto.
        const haystack = `${msg.Text ?? ""}\n${msg.HTML ?? ""}`;
        const m = haystack.match(/https?:\/\/localhost:8000\/auth\/v1\/verify[^\s"<)]+/);
        if (m) return m[0].replace(/&amp;/g, "&");
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No magic link in Mailpit for ${email}`);
}
