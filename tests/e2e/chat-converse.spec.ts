import { test, expect } from "@playwright/test";
import { signInViaMailpit } from "./helpers/auth";

test.setTimeout(60000);

test("two users can exchange messages in a chat", async ({ browser, request }) => {
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await signInViaMailpit(pageA, request, "Conv Alice");

  await pageA.goto("/listings/new");
  await pageA.getByLabel(/type/i).selectOption("offer");
  await pageA.getByLabel(/title/i).fill("Carrots from the garden");
  await pageA.locator("select[name=category_id]").selectOption({ label: "Garden" });
  await pageA.locator("select[name=area_id]").selectOption({ label: "Quathiaski Cove" });
  await pageA.getByRole("button", { name: /publish/i }).click();
  await expect(pageA).toHaveURL(/\/l\/[0-9a-f-]+\/carrots-from-the-garden/);
  const listingUrl = pageA.url();

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await signInViaMailpit(pageB, request, "Conv Bob");
  await pageB.goto(listingUrl);
  await pageB.getByRole("button", { name: /offer a swap/i }).click();
  await expect(pageB).toHaveURL(/\/chats\/[0-9a-f-]+/);

  // Bob sees the auto-greeting he sent.
  await expect(pageB.getByText(/i'd like to swap for your listing.*carrots/i)).toBeVisible();

  // Bob types a message.
  await pageB.getByLabel(/message/i).fill("How about Tuesday at 4?");
  await pageB.getByRole("button", { name: /send/i }).click();
  await expect(pageB.getByText(/tuesday at 4/i)).toBeVisible();

  // Alice opens the chat
  await pageA.goto("/chats");
  await pageA.getByRole("link", { name: /carrots from the garden/i }).click();
  await expect(pageA).toHaveURL(/\/chats\/[0-9a-f-]+/);
  await expect(pageA.getByText(/tuesday at 4/i)).toBeVisible();

  // Alice replies
  await pageA.getByLabel(/message/i).fill("Tuesday works.");
  await pageA.getByRole("button", { name: /send/i }).click();
  await expect(pageA.getByText(/tuesday works/i)).toBeVisible();
});
