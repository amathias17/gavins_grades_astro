import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { calculatePayout } from "../../src/utils/payout";

const missingAssignmentsData = JSON.parse(
  readFileSync(new URL("../../src/data/missing_assignments.json", import.meta.url), "utf8"),
) as {
  missing_assignments: Array<{
    assignment_name: string;
    class_name: string;
    due_date: string;
  }>;
};

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

  test("blocks the payout when missing assignments exist", () => {
    const result = calculatePayout([
      { class_name: "English", period: "1", current_grade: 96 },
      { class_name: "Math", period: "2", current_grade: 91 },
    ], true);

    expect(result.qualifyingACount).toBe(0);
    expect(result.totalPayout).toBe(0);
    expect(result.classes.every((classInfo) => !classInfo.qualifies && classInfo.payout === 0)).toBe(true);
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
    await expect(page.getByLabel(/\$\d+ total earned/)).toBeVisible();
    await expect(page.locator(".currency-symbol")).toHaveText("$");
    await expect(page.locator(".money-label-kicker")).toHaveText("CAN BUY");
    await expect(page.locator(".site-header")).toHaveCount(0);
  });

  test("centers the purchase label under the numeric payout", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".total")).not.toHaveClass(/is-spinning/, { timeout: 3000 });

    const centers = await page.evaluate(() => {
      const value = document.querySelector(".total-value")?.getBoundingClientRect();
      const label = document.querySelector(".money-label-frame")?.getBoundingClientRect();
      return {
        valueCenter: value ? value.x + value.width / 2 : null,
        labelCenter: label ? label.x + label.width / 2 : null,
      };
    });

    expect(centers.valueCenter).not.toBeNull();
    expect(centers.labelCenter).not.toBeNull();
    expect(Math.abs((centers.valueCenter ?? 0) - (centers.labelCenter ?? 0))).toBeLessThanOrEqual(1);
  });

  test("renders the scraper-provided missing assignments below the total", async ({ page }) => {
    await page.goto("/");

    const assignments = missingAssignmentsData.missing_assignments;
    const summary = page.locator(".missing-summary");

    await expect(summary).toBeVisible();
    expect(await summary.evaluate((element) => element.previousElementSibling?.classList.contains("money-label-frame"))).toBe(true);
    await expect(summary.getByRole("heading", { name: "Missing assignments" })).toBeVisible();
    await expect(summary.locator(".missing-summary-count")).toHaveText(String(assignments.length));
    await expect(summary.getByRole("listitem")).toHaveCount(assignments.length);

    if (assignments.length > 0) {
      await expect(summary).toContainText(assignments[0].assignment_name);
      await expect(summary).toContainText(assignments[0].class_name);
      await expect(summary).toContainText(assignments[0].due_date.replace(/\s*\(Q\d+\)/i, ""));
    } else {
      await expect(summary).toContainText("No missing assignments");
    }
  });

  test("opens the feedback response modal", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Press to Submit Feedback" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("#feedback-message")).toHaveText("lol turn in your assignments.");
    await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();

    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("rotates the money label with the initial word rendered server-side", async ({ page }) => {
    await page.goto("/");

    const label = page.locator("[data-money-label]");
    await expect(label).not.toHaveText("DOLLARS");
    await page.waitForTimeout(2400);
    await expect(label).toHaveClass(/is-ready/);
    await expect(page.locator(".total")).not.toHaveClass(/is-spinning/);
    await page.waitForTimeout(6200);
    await expect(label).not.toHaveText("DOLLARS");
    await expect(label).toHaveCSS("font-size", /.+/);
  });
});
