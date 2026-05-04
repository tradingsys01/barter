import { test, expect } from "@playwright/test";
import { signInViaMailpit } from "./helpers/auth";

test("user can report a listing they don't own", async ({ browser, request }) => {
  test.setTimeout(60_000);

  // Owner posts
  const ctxO = await browser.newContext();
  const pageO = await ctxO.newPage();
  await signInViaMailpit(pageO, request, "Reportee Owen");
  await pageO.goto("/listings/new");
  await pageO.getByLabel(/type/i).selectOption("offer_goods");
  await pageO.getByLabel(/title/i).fill("Reportable rutabaga");
  await pageO.locator("select[name=category_id]").selectOption({ label: "Food" });
  await pageO.locator("select[name=area_id]").selectOption({ label: "Quathiaski Cove" });
  await pageO.getByRole("button", { name: /publish/i }).click();
  await expect(pageO).toHaveURL(/\/l\/[0-9a-f-]+\//);
  const url = pageO.url();

  // Reporter sees it and reports
  const ctxR = await browser.newContext();
  const pageR = await ctxR.newPage();
  await signInViaMailpit(pageR, request, "Reporter Rita");
  await pageR.goto(url);
  await pageR.getByRole("button", { name: /^report$/i }).click();
  await pageR.getByLabel(/why are you reporting/i).fill("Test report — please ignore.");
  await pageR.getByRole("button", { name: /submit report/i }).click();
  await expect(pageR.getByText(/report sent/i)).toBeVisible();
});
