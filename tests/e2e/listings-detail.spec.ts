import { test, expect } from "@playwright/test";
import { signInViaMailpit } from "./helpers/auth";

test("listing detail page renders title, description, and JSON-LD", async ({ page, request }) => {
  await signInViaMailpit(page, request, "Tester");

  // Post a listing
  await page.goto("/listings/new");
  await page.getByLabel(/type/i).selectOption("offer");
  await page.getByLabel(/title/i).fill("Detail page test apples");
  await page.getByLabel(/description/i).fill("Just for the detail page test.");
  await page.locator("select[name=category_id]").selectOption({ label: "Food" });
  await page.locator("select[name=area_id]").selectOption({ label: "Quathiaski Cove" });
  await page.getByRole("button", { name: /publish/i }).click();

  await expect(page).toHaveURL(/\/l\/[0-9a-f-]+\/detail-page-test-apples/);
  await expect(page.getByRole("heading", { name: /detail page test apples/i })).toBeVisible();
  await expect(page.getByText(/just for the detail page test/i)).toBeVisible();
  await expect(page.getByText(/quathiaski cove/i)).toBeVisible();

  // JSON-LD present and parseable.
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(ld).toBeTruthy();
  const data = JSON.parse(ld!);
  expect(data["@context"]).toBe("https://schema.org");
  expect(data.name).toMatch(/detail page test apples/i);
});
