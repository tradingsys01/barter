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
import { test, expect } from "@playwright/test";
import { signInViaMailpit } from "./helpers/auth";

test("magic-link signup flow lands on /onboarding then /me", async ({ page, request }) => {
  await signInViaMailpit(page, request, "Test User");

  await expect(page).toHaveURL(/\/me/, { timeout: 15_000 });
  await expect(page.getByText(/hi test user/i)).toBeVisible();
});
