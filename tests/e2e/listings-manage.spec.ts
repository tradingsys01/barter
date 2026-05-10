import { test, expect } from "@playwright/test";
import { signInViaMailpit } from "./helpers/auth";

test("user can edit and archive their own listing", async ({ page, request }) => {
  await signInViaMailpit(page, request, "Manager");

  // Post one
  await page.goto("/listings/new");
  await page.getByLabel(/type/i).selectOption("offer");
  await page.getByLabel(/title/i).fill("Manage me apples");
  await page.locator("select[name=category_id]").selectOption({ label: "Food" });
  await page.locator("select[name=area_id]").selectOption({ label: "Quathiaski Cove" });
  await page.getByRole("button", { name: /publish/i }).click();
  await expect(page).toHaveURL(/\/l\/[0-9a-f-]+\/manage-me-apples/);

  // Edit it
  await page.goto("/me/listings");
  await page.getByRole("link", { name: /^edit$/i }).first().click();
  await page.getByLabel(/title/i).fill("Manage me apples (edited)");
  await page.getByRole("button", { name: /save/i }).click();
  await expect(page).toHaveURL(/\/l\/[0-9a-f-]+\/manage-me-apples-edited/);

  // Archive it
  await page.goto("/me/listings");
  await page.getByRole("button", { name: /archive/i }).first().click();
  await expect(page).toHaveURL(/\/me\/listings$/);
  await expect(page.getByText(/manage me apples \(edited\)/i)).toHaveCount(0);
});
