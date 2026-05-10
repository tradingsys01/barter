import { test, expect } from "@playwright/test";
import { signInViaMailpit } from "./helpers/auth";

test("two users complete a trade and rate each other", async ({ browser, request }) => {
  test.setTimeout(60_000);

  // Alice posts
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await signInViaMailpit(pageA, request, "Trade Alice");
  await pageA.goto("/listings/new");
  await pageA.getByLabel(/type/i).selectOption("offer");
  await pageA.getByLabel(/title/i).fill("Honey jar from our hives");
  await pageA.locator("select[name=category_id]").selectOption({ label: "Food" });
  await pageA.locator("select[name=area_id]").selectOption({ label: "Quathiaski Cove" });
  await pageA.getByRole("button", { name: /publish/i }).click();
  await expect(pageA).toHaveURL(/\/l\/[0-9a-f-]+\//);
  const listingUrl = pageA.url();

  // Bob offers
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await signInViaMailpit(pageB, request, "Trade Bob");
  await pageB.goto(listingUrl);
  await pageB.getByRole("button", { name: /offer a swap/i }).click();
  await expect(pageB).toHaveURL(/\/chats\/[0-9a-f-]+/);

  // Bob marks the trade done
  await pageB.getByRole("button", { name: /mark trade done/i }).click();
  await expect(pageB.getByText(/waiting for the other party/i)).toBeVisible();

  // Alice goes to chats and confirms
  await pageA.goto("/chats");
  await pageA.getByRole("link", { name: /honey jar/i }).click();
  await pageA.getByRole("button", { name: /^confirm$/i }).click();

  // Both see the rating form
  await expect(pageA.getByText(/how was the trade/i)).toBeVisible();
  await pageB.reload();
  await expect(pageB.getByText(/how was the trade/i)).toBeVisible();

  // Alice rates 5 stars
  await pageA.getByRole("button", { name: /^5 stars$/i }).click();
  await pageA.getByLabel(/comment/i).fill("Smooth and friendly.");
  await pageA.getByRole("button", { name: /submit rating/i }).click();
  await expect(pageA.getByText(/thanks for rating/i)).toBeVisible();
});
