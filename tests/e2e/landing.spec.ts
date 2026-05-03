import { test, expect } from "@playwright/test";

test("landing page shows hero + feed", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Quadra Barter" })).toBeVisible();
  // Hero + CTA still present.
  await expect(page.getByRole("heading", { name: /swap goods and services/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /get started/i })).toBeVisible();
  // Feed section heading.
  await expect(page.getByRole("heading", { name: /latest listings/i })).toBeVisible();
});
