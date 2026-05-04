import { test, expect } from "@playwright/test";
import { signInViaMailpit } from "./helpers/auth";

test("public profile shows display name, area, listings", async ({ page, request }) => {
  await signInViaMailpit(page, request, "Profile Pat");
  // Get the user id by signing in then reading from /me — or post a listing
  // and pull the owner from the URL.
  await page.goto("/listings/new");
  await page.getByLabel(/type/i).selectOption("offer_goods");
  await page.getByLabel(/title/i).fill("Profile test sweater");
  await page.locator("select[name=category_id]").selectOption({ label: "Clothing" });
  await page.locator("select[name=area_id]").selectOption({ label: "Quathiaski Cove" });
  await page.getByRole("button", { name: /publish/i }).click();
  await expect(page).toHaveURL(/\/l\/[0-9a-f-]+\/profile-test-sweater/);

  // The owner-name link on listing detail goes to /u/[id]
  await page.getByRole("link", { name: /profile pat/i }).click();
  await expect(page).toHaveURL(/\/u\/[0-9a-f-]+/);

  await expect(page.getByRole("heading", { name: /profile pat/i })).toBeVisible();
  await expect(page.getByText(/quathiaski cove/i).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /profile test sweater/i })).toBeVisible();
});
