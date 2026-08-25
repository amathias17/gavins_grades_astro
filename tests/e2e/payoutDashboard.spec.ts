import { expect, test } from "@playwright/test";
import { calculatePayout } from "../../src/utils/payout";

test.describe("A-grade payout dashboard", () => {
  test("calculates $50 for each numeric A", () => {
    const result = calculatePayout([
      { class_name: "English", period: "1", current_grade: 90 },
      { class_name: "Math", period: "2", current_grade: 96 },
      { class_name: "Science", period: "3", current_grade: 89 },
    ]);

    expect(result.qualifyingACount).toBe(2);
    expect(result.totalPayout).toBe(100);
    expect(result.classes[2].payout).toBe(0);
  });

  test("treats an empty new-year import as zero earnings", () => {
    const result = calculatePayout([]);

    expect(result.qualifyingACount).toBe(0);
    expect(result.totalPayout).toBe(0);
    expect(result.classes).toHaveLength(0);
  });

  test("renders the live payout state from the imported grade data", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#payout-heading")).toHaveText("HOW MUCH MONEY WILL GAVIN TAKE FROM DAD?");
    await expect(page.locator("#payout-heading")).toBeVisible();
    await expect(page.getByLabel(/\d+ dollars total earned/)).toBeVisible();
    await expect(page.locator(".site-header")).toHaveCount(0);
  });

  test("opens the feedback response modal", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Press to Submit Feedback" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("#feedback-message")).toHaveText("lol turn in your assignments.");

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test("rotates the money label with the initial word rendered server-side", async ({ page }) => {
    await page.goto("/");

    const label = page.locator("[data-money-label]");
    await expect(label).toHaveText("DOLLARS");
    await expect(label).not.toHaveClass(/is-ready/);
    await expect(page.locator(".total")).toHaveClass(/is-spinning/);
    await page.waitForTimeout(2400);
    await expect(label).toHaveClass(/is-ready/);
    await expect(page.locator(".total")).not.toHaveClass(/is-spinning/);
    await page.waitForTimeout(6200);
    await expect(label).toHaveClass(/is-glitching/);
    await expect(label).not.toHaveText("DOLLARS");
    await expect(label).toHaveCSS("font-size", /.+/);
  });
});
