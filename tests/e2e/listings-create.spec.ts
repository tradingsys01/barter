import { test, expect } from "@playwright/test";
import { signInViaMailpit } from "./helpers/auth";

test("authed user can post a listing", async ({ page, request }) => {
  await signInViaMailpit(page, request, "Test User");

  await page.goto("/listings/new");
  await page.getByLabel(/type/i).selectOption("offer_goods");
  await page.getByLabel(/title/i).fill("Two ripe apples from our tree");
  await page.getByLabel(/description/i).fill("Picked this morning.");
  await page.locator("select[name=category_id]").selectOption({ label: "Food" });
  await page.locator("select[name=area_id]").selectOption({ label: "Quathiaski Cove" });
  await page.getByLabel(/what.*swap.*for/i).fill("Eggs or jam");

  await page.getByRole("button", { name: /publish/i }).click();

  await expect(page).toHaveURL(/\/l\/[0-9a-f-]+\/two-ripe-apples-from-our-tree/);
});
