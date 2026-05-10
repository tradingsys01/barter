import { test, expect } from "@playwright/test";
import { signInViaMailpit } from "./helpers/auth";

test("a different user can offer a swap and lands on a chat", async ({ browser, request }) => {
  // User A: post a listing
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await signInViaMailpit(pageA, request, "Owner Alice");

  await pageA.goto("/listings/new");
  await pageA.getByLabel(/type/i).selectOption("offer");
  await pageA.getByLabel(/title/i).fill("Sourdough loaf");
  await pageA.locator("select[name=category_id]").selectOption({ label: "Food" });
  await pageA.locator("select[name=area_id]").selectOption({ label: "Quathiaski Cove" });
  await pageA.getByRole("button", { name: /publish/i }).click();
  await expect(pageA).toHaveURL(/\/l\/[0-9a-f-]+\/sourdough-loaf/);
  const listingUrl = pageA.url();

  // User B: visit the listing, click "Offer a swap"
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await signInViaMailpit(pageB, request, "Buyer Bob");
  await pageB.goto(listingUrl);
  await pageB.getByRole("button", { name: /offer a swap/i }).click();
  await expect(pageB).toHaveURL(/\/chats\/[0-9a-f-]+/);
  // T10 will add a page-content assertion here.
});
