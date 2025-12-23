import { test, expect } from "@playwright/test";

test.describe("Missing Quests modal", () => {
  test("should open the impact modal from the missing quests list", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const questButtons = page.locator(".missing-quest-button");
    const questCount = await questButtons.count();
    test.skip(questCount === 0, "No missing quests data available");

    await questButtons.first().click();

    const modal = page.locator("#missing-quest-modal");
    await expect(modal).toBeVisible();
    await expect(page.locator("#missing-quest-assignment")).toHaveText(/.+/);
    await expect(page.locator("#missing-quest-projected-grade")).toHaveText(/.+/);

    await page.locator("#missing-quest-close").click();
    await expect(modal).toBeHidden();
  });
});
