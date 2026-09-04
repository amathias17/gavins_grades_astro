import { expect, test } from "@playwright/test";
import { calculateGradeRecovery } from "../../src/utils/gradeRecovery";

test.describe("grade recovery quest", () => {
  test("reconciles duplicate feeds, projects full credit, and sorts by opportunity", () => {
    const summaries = calculateGradeRecovery(
      [
        { class_name: "Alpha", period: "1", current_grade: 80, letter_grade: "B" },
        { class_name: "Beta", period: "2", current_grade: null, letter_grade: null },
      ],
      [
        { class_name: "Alpha", assignment_name: "Lab", due_date: "09/01/2026", max_points: "10" },
        { class_name: "Alpha", assignment_name: "Lab", due_date: "09/01/2026", max_points: "10" },
        { class_name: "Beta", assignment_name: "Unknown Total", due_date: "09/01/2026", max_points: "25" },
      ],
      [{
        className: "ALPHA",
        period: "1",
        assignments: [{ name: "Lab", dueDate: "09/01/2026", earnedPoints: 0, totalPoints: 10 }],
      }],
    );

    expect(summaries.map((summary) => summary.className)).toEqual(["Beta", "Alpha"]);
    expect(summaries[0]).toMatchObject({ missingCount: 1, missingPoints: 25, projectedGrade: null, projectedLetterGrade: null, hasEstimate: false });
    expect(summaries[1]).toMatchObject({ missingCount: 1, missingPoints: 10, projectedGrade: 100, projectedLetterGrade: "A", gradeDelta: 20, hasEstimate: true });
  });

  test("renders recovery cards and class-plan links on the homepage", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#recovery-heading")).toHaveText("GRADE RECOVERY QUEST");
    await expect(page.locator(".recovery-card")).toHaveCount(2);
    await expect(page.locator(".recovery-card").first()).toContainText("Chemistry 2");
    await expect(page.locator(".recovery-card").first()).toContainText("40 PTS AVAILABLE");
    await expect(page.locator(".recovery-card").first().getByRole("link", { name: /View class plan/ })).toHaveAttribute("href", "/classes/3");
    await expect(page.locator(".recovery-card").last()).toContainText("48%");
    await expect(page.locator(".recovery-card").last()).toContainText("F");
  });

  test("does not overflow on a phone-sized viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    expect(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
