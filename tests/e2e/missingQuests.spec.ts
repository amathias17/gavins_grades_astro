import { test, expect } from "@playwright/test";

test.describe("Homepage focus", () => {
  test("keeps the homepage focused on the payout summary", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: /Good grades/ })).toBeVisible();
    await expect(page.getByText("The breakdown")).toBeVisible();
    await expect(page.locator(".missing-quest-button")).toHaveCount(0);
  });
});
