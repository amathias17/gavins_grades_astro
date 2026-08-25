import { test, expect } from "@playwright/test";

test.describe("Homepage focus", () => {
  test("keeps the homepage focused on the payout summary", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.getByLabel(/\$\d+ total earned/)).toBeVisible();
    await expect(page.locator(".site-header")).toHaveCount(0);
    await expect(page.locator(".missing-quest-button")).toHaveCount(0);
  });
});
