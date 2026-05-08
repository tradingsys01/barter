/**
 * Happy-path e2e: OTP code signup flow.
 *
 * Same end state as the link flow but the user pastes the 6-digit code from
 * the email instead of clicking the link — useful when the link is opened on
 * a different device or the link is mangled by an email client.
 */
import { test, expect } from "@playwright/test";
import { signInViaMailpitCode } from "./helpers/auth";

test("OTP-code sign-in lands on /onboarding then /me", async ({ page, request }) => {
  await signInViaMailpitCode(page, request, "Code Tester");
  await expect(page).toHaveURL(/\/me/, { timeout: 15_000 });
  await expect(page.getByText(/hi code tester/i)).toBeVisible();
});
