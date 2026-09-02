import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { extractAssignmentDetails, getAssignmentScoreHint } = require("../../scraper/enhanced-scraper.cjs") as {
  extractAssignmentDetails: (page: import("@playwright/test").Page, assignmentId: string, classId: string) => Promise<{
    graded: boolean;
    earnedPoints: number | null;
    totalPoints: number | null;
  }>;
  getAssignmentScoreHint: (text: string) => { status: string; totalPoints: number | null };
};

test.describe("assignment detail scraper", () => {
  test("uses the visible assignment dialog instead of a hidden stale dialog", async ({ page }) => {
    await page.setContent(`
      <a id="showAssignmentInfo" data-aid="assignment-1" data-gid="class-1">Selected assignment</a>
      <div class="sf_Dialog" style="display:none">Points Earned: 9 / 10</div>
      <div class="sf_Dialog" role="dialog" style="display:block; width:200px; height:100px">Points Earned: 0 / 10</div>
    `);

    await expect.poll(async () => (await page.locator('.sf_Dialog:visible').count())).toBe(1);
    const details = await extractAssignmentDetails(page, "assignment-1", "class-1");

    expect(details).toMatchObject({ graded: true, earnedPoints: 0, totalPoints: 10 });
  });

  test("distinguishes explicit ungraded markers from valid numeric zero grades", () => {
    expect(getAssignmentScoreHint("Selected assignment * out of 10")).toEqual({ status: "ungraded", totalPoints: 10 });
    expect(getAssignmentScoreHint("Selected assignment 0/10")).toEqual({ status: "graded", totalPoints: 10 });
    expect(getAssignmentScoreHint("Selected assignment 9/10")).toEqual({ status: "graded", totalPoints: 10 });
    expect(getAssignmentScoreHint("Due 09/01/2026")).toEqual({ status: "unknown", totalPoints: null });
  });
});
