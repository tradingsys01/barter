import { test, expect, type APIRequestContext } from "@playwright/test";
import { signInViaMailpit } from "./helpers/auth";

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

async function chatEmailCount(request: APIRequestContext, recipient: string): Promise<number> {
  const r = await request.get(
    `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${recipient} subject:"New message"`)}`,
  );
  if (!r.ok()) return 0;
  const j = await r.json();
  return (j.messages ?? []).length;
}

async function waitForCount(
  request: APIRequestContext,
  recipient: string,
  expected: number,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = -1;
  while (Date.now() < deadline) {
    last = await chatEmailCount(request, recipient);
    if (last === expected) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  expect(last, `chat-email count for ${recipient}`).toBe(expected);
}

async function expectStableCount(
  request: APIRequestContext,
  recipient: string,
  expected: number,
  durationMs = 3_000,
): Promise<void> {
  const deadline = Date.now() + durationMs;
  while (Date.now() < deadline) {
    const c = await chatEmailCount(request, recipient);
    expect(c, `chat-email count for ${recipient} should stay ${expected}`).toBe(expected);
    await new Promise((r) => setTimeout(r, 500));
  }
}

test.setTimeout(90_000);

test("one chat email per chat — greeting only, no email on follow-ups", async ({
  browser,
  request,
}) => {
  // Owner (Alice) posts a listing.
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  const emailA = await signInViaMailpit(pageA, request, "EmailOnce Alice");

  await pageA.goto("/listings/new");
  await pageA.getByLabel(/type/i).selectOption("offer");
  await pageA.getByLabel(/title/i).fill("Email-once smoke");
  await pageA.locator("select[name=category_id]").selectOption({ label: "Garden" });
  await pageA.locator("select[name=area_id]").selectOption({ label: "Quathiaski Cove" });
  await pageA.getByRole("button", { name: /publish/i }).click();
  await expect(pageA).toHaveURL(/\/l\/[0-9a-f-]+\/email-once-smoke/);
  const listingUrl = pageA.url();

  // Initiator (Bob) signs in.
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  const emailB = await signInViaMailpit(pageB, request, "EmailOnce Bob");

  // No chat emails yet for either side.
  expect(await chatEmailCount(request, emailA)).toBe(0);
  expect(await chatEmailCount(request, emailB)).toBe(0);

  // Bob clicks "Offer a swap" — startChat fires a single email to Alice.
  await pageB.goto(listingUrl);
  await pageB.getByRole("button", { name: /offer a swap/i }).click();
  await expect(pageB).toHaveURL(/\/chats\/[0-9a-f-]+/);

  await waitForCount(request, emailA, 1);

  // Bob sends a follow-up — must NOT add a new email for Alice.
  await pageB.getByLabel(/message/i).fill("Follow-up from initiator");
  await pageB.getByRole("button", { name: /send/i }).click();
  await expect(pageB.getByText(/follow-up from initiator/i)).toBeVisible();
  await expectStableCount(request, emailA, 1, 3_000);

  // Alice opens the chat and replies — must NOT email Bob.
  await pageA.goto("/chats");
  await pageA.getByRole("link", { name: /email-once smoke/i }).click();
  await pageA.getByLabel(/message/i).fill("Reply from owner");
  await pageA.getByRole("button", { name: /send/i }).click();
  await expect(pageA.getByText(/reply from owner/i)).toBeVisible();
  await expectStableCount(request, emailB, 0, 3_000);
});
