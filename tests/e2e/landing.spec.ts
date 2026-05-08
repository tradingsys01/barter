import { test, expect } from "@playwright/test";
import { signInViaMailpit } from "./helpers/auth";

test("landing page shows hero + feed (signed out)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Quadra Barter" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /swap goods and services/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /get started/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /latest listings/i })).toBeVisible();
});

test("landing page hides Get started and header greets the user when signed in", async ({ page, request }) => {
  await signInViaMailpit(page, request, "Quadra Tester");
  await page.goto("/");
  // Marketing heading still rendered (it's the page title).
  await expect(page.getByRole("heading", { name: /swap goods and services/i })).toBeVisible();
  // Get-started CTA removed — the user already has an account.
  await expect(page.getByRole("link", { name: /^get started$/i })).toHaveCount(0);
  // Header carries an explicit signed-in cue.
  await expect(page.getByText(/hi,\s*quadra tester/i)).toBeVisible();
});
