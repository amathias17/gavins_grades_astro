import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getClassRouteKey } from "../../src/utils/classRoutes";

const gradesData = JSON.parse(
  readFileSync(path.resolve("src/data/grades.json"), "utf8"),
) as {
  metadata: { last_updated: string };
  classes: Array<{
    class_name: string;
    period: string;
    class_id?: string | null;
    current_grade: number | null;
    letter_grade: string | null;
  }>;
};

test.describe("Grade Room", () => {
  test("shows every current class with a class-plan link", async ({ page }) => {
    await page.goto("/grades");

    await expect(page).toHaveTitle("Gavin's Grades");
    await expect(page.locator("#grade-room-title")).toHaveText("GRADE ROOM");
    await expect(page.locator("[data-grade-card]")).toHaveCount(gradesData.classes.length);
    await expect(page.locator(".freshness")).toContainText(gradesData.metadata.last_updated);

    for (const classInfo of gradesData.classes) {
      const card = page.locator("[data-grade-card]").filter({ hasText: classInfo.class_name });
      await expect(card).toContainText(typeof classInfo.current_grade === "number" ? `${classInfo.current_grade}%` : "--");
      await expect(card).toContainText(classInfo.letter_grade || "--");
      await expect(card).toHaveAttribute("href", `/classes/${getClassRouteKey(classInfo, gradesData.classes)}`);
    }
  });

  test("keeps the Grade Room readable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 428, height: 926 });
    await page.goto("/grades");

    await expect(page.locator(".grade-grid")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  test("keeps history as the grade trend page", async ({ page }) => {
    await page.goto("/history");

    await expect(page.locator("h1")).toContainText("GRADE.LOG");
    await expect(page.locator("svg").first()).toBeVisible();
  });
});
