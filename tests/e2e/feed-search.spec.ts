import { test, expect } from "@playwright/test";
import { signInViaMailpit } from "./helpers/auth";

test("feed filters by search query and category chip", async ({ page, request }) => {
  await signInViaMailpit(page, request, "Searcher Sam");

  // Post two listings with distinct titles + categories
  for (const [title, category] of [
    ["Search target apples here", "Food"],
    ["Unrelated tools post", "Tools"],
  ] as const) {
    await page.goto("/listings/new");
    await page.getByLabel(/type/i).selectOption("offer");
    await page.getByLabel(/title/i).fill(title);
    await page.locator("select[name=category_id]").selectOption({ label: category });
    await page.locator("select[name=area_id]").selectOption({ label: "Quathiaski Cove" });
    await page.getByRole("button", { name: /publish/i }).click();
    await expect(page).toHaveURL(/\/l\/[0-9a-f-]+\//);
  }

  // Plain home shows both
  await page.goto("/");
  await expect(page.getByRole("link", { name: /search target apples/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /unrelated tools/i }).first()).toBeVisible();

  // Search filters
  await page.getByPlaceholder(/search/i).fill("apples");
  await page.getByPlaceholder(/search/i).press("Enter");
  await expect(page).toHaveURL(/\/\?.*q=apples/);
  await expect(page.getByRole("link", { name: /search target apples/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /unrelated tools/i })).toHaveCount(0);

  // Category chip narrows further (still Food, still apples)
  await page.goto("/?c=tools");
  await expect(page.getByRole("link", { name: /unrelated tools/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /search target apples/i })).toHaveCount(0);
});

test("search stems related word forms (excavator <-> excavation)", async ({
  page,
  request,
}) => {
  await signInViaMailpit(page, request, "Stemming Steve");

  await page.goto("/listings/new");
  await page.getByLabel(/type/i).selectOption("offer");
  await page.getByLabel(/title/i).fill("Excavator work for hire");
  await page.locator("select[name=category_id]").selectOption({ label: "Tools" });
  await page.locator("select[name=area_id]").selectOption({ label: "Quathiaski Cove" });
  await page.getByRole("button", { name: /publish/i }).click();
  await expect(page).toHaveURL(/\/l\/[0-9a-f-]+\//);

  // Searching for "excavation" should still match the "excavator" listing
  // because both stem to "excavat" under the english config.
  await page.goto("/?q=excavation");
  await expect(page.getByRole("link", { name: /excavator work for hire/i }).first()).toBeVisible();
});

test("clearing the search drops q from the URL and preserves other filters", async ({
  page,
  request,
}) => {
  await signInViaMailpit(page, request, "Clearer Carla");

  // Land on a filtered URL: query + category.
  await page.goto("/?q=jar&c=tools");
  // Submit with the field emptied — q should drop, c should stay.
  const search = page.getByPlaceholder(/search/i);
  await search.fill("");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/\?(?!.*\bq=).*c=tools/);

  // Clear via the × button after typing — also drops q.
  await page.goto("/?q=jar");
  await page.getByRole("button", { name: /clear search/i }).click();
  await expect(page).toHaveURL("/");
});
