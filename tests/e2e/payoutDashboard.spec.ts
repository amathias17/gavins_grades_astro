import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { calculatePayout } from "../../src/utils/payout";

const gradesData = JSON.parse(
  readFileSync(new URL("../../src/data/grades.json", import.meta.url), "utf8"),
) as { classes: { class_name: string; period: string; current_grade: number }[] };

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

    await expect(page.getByRole("heading", { name: /Good grades/ })).toBeVisible();
    await expect(page.getByLabel(/\$\d+ total earned/)).toBeVisible();

    if (gradesData.classes.length === 0) {
      await expect(page.getByRole("status")).toContainText("No current classes");
    } else {
      const payout = calculatePayout(gradesData.classes);
      await expect(page.getByText(`${payout.qualifyingACount} ${payout.qualifyingACount === 1 ? "A" : "As"} x $50`)).toBeVisible();
      await expect(page.getByLabel("Current class payout breakdown")).toBeVisible();
    }
  });
});
