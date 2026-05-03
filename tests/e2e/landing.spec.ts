import { test, expect } from "@playwright/test";

test("landing page shows headline and brand", async ({ page }) => {
  await page.goto("/");
  // Brand mark in the site header (link, not heading).
  await expect(page.getByRole("link", { name: "Quadra Barter" })).toBeVisible();
  // Hero headline on the page.
  await expect(page.getByRole("heading", { name: /swap goods and services/i })).toBeVisible();
  // Tagline.
  await expect(page.getByText(/no money/i)).toBeVisible();
  // Get started CTA links to /signin.
  await expect(page.getByRole("link", { name: /get started/i })).toBeVisible();
});
