import { test, expect } from "@playwright/test";

test("landing page shows headline", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Quadra Island Barter" })).toBeVisible();
  await expect(page.getByText(/no money/i)).toBeVisible();
});
