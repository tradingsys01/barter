import { test, expect } from "@playwright/test";

test("signin page renders email form", async ({ page }) => {
  await page.goto("/signin");
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /send link/i })).toBeVisible();
});
