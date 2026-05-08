/**
 * Chats menu shows an unread badge after the other party messages me, and
 * the badge clears once I open the chat.
 */
import { test, expect } from "@playwright/test";
import { signInViaMailpit } from "./helpers/auth";

test.setTimeout(60000);

test("Chats link shows unread badge for the recipient and clears on view", async ({
  browser,
  request,
}) => {
  // Alice posts.
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await signInViaMailpit(pageA, request, "Badge Alice");
  await pageA.goto("/listings/new");
  await pageA.getByLabel(/type/i).selectOption("offer_goods");
  await pageA.getByLabel(/title/i).fill("Badge test pumpkins");
  await pageA.locator("select[name=category_id]").selectOption({ label: "Food" });
  await pageA.locator("select[name=area_id]").selectOption({ label: "Quathiaski Cove" });
  await pageA.getByRole("button", { name: /publish/i }).click();
  await expect(pageA).toHaveURL(/\/l\/[0-9a-f-]+\//);
  const listingUrl = pageA.url();

  // Bob starts a chat (auto-greeting fires from Bob → Alice).
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await signInViaMailpit(pageB, request, "Badge Bob");
  await pageB.goto(listingUrl);
  await pageB.getByRole("button", { name: /offer a swap/i }).click();
  await expect(pageB).toHaveURL(/\/chats\/[0-9a-f-]+/);

  // Alice's homepage should now flag one unread chat.
  await pageA.goto("/");
  const chatsLink = pageA.getByRole("link", { name: /^chats/i });
  await expect(chatsLink).toContainText(/1/);

  // Open the chat — badge should clear.
  await chatsLink.click();
  await pageA.getByRole("link", { name: /badge test pumpkins/i }).click();
  await expect(pageA).toHaveURL(/\/chats\/[0-9a-f-]+/);
  await pageA.goto("/");
  await expect(pageA.getByRole("link", { name: /^chats/i })).not.toContainText(/\d/);
});
