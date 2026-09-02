import { expect, test } from "@playwright/test";

test.describe("positive points dashboard", () => {
  test("renders points, milestone progress, bonuses, and opportunities", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#points-heading")).toHaveText("GAVIN'S POINTS QUEST");
    await expect(page.locator(".points-value")).toHaveText(/PTS/);
    await expect(page.locator(".milestone-track")).toHaveAttribute("role", "progressbar");
    await expect(page.locator(".point-stats")).toBeVisible();
    await expect(page.locator("#opportunity-heading")).toHaveText("POINTS READY TO EARN");
    await expect(page.locator(".points-screen")).not.toContainText("$");
    await expect(page.locator(".points-screen")).not.toContainText("CAN BUY");
  });

  test("does not show a missing-grade alarm when incomplete work exists", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator(".total")).toHaveCount(0);
    await expect(page.locator(".missing-grade-alarm")).toHaveCount(0);
    await expect(page.locator(".opportunity-panel")).toBeVisible();
    await expect(page.locator(".opportunity-panel")).toContainText("READY");
    await expect(page.locator(".opportunity-panel")).toContainText("AWAITING GRADES");
    await expect(page.locator(".opportunity-total")).toHaveText("5 READY");
    await expect(page.locator(".awaiting-total")).toHaveText("50 AWAITING GRADES");
    await expect(page.locator(".opportunity-status").first()).toHaveText(/MISSING|NOT GRADED/);
  });

  test("keeps the mobile dashboard inside the viewport with top breathing room", async ({ page }) => {
    await page.setViewportSize({ width: 428, height: 926 });
    await page.goto("/");

    await expect(page.locator(".points-screen")).toHaveCSS("padding-top", "48px");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  test("opens and closes the accessible feedback modal", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "HOW POINTS WORK" }).click({ force: true });
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveRole("dialog");
    await expect(dialog.locator("#points-guide-heading")).toHaveText("HOW YOUR POINTS GROW");
    await expect(dialog).toContainText("ASSIGNMENT POINTS");
    await expect(dialog).toContainText("FULL-CREDIT BONUS");
    await expect(dialog).toContainText("OPEN OPPORTUNITIES");
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("opens the current-period assignment points breakdown", async ({ page }) => {
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "VIEW ASSIGNMENT BREAKDOWN" });
    await trigger.click({ force: true });

    const dialog = page.locator("#breakdown-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("#breakdown-heading")).toHaveText("ASSIGNMENT BREAKDOWN");
    await expect(dialog.locator(".breakdown-summary")).toContainText("BONUSES");
    await expect(dialog.locator(".breakdown-summary")).toContainText("AVAILABLE POINTS");
    await expect(dialog.locator(".breakdown-class")).not.toHaveCount(0);
    await expect(dialog.locator(".breakdown-class li")).not.toHaveCount(0);
    await expect(dialog.locator(".breakdown-status").first()).toHaveText(/COMPLETED|MISSING|NOT GRADED|OPEN/);

    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });
});
