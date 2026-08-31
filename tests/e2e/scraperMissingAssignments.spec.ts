import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { scrapeMissingAssignments } = require("../../scraper/enhanced-scraper.cjs") as {
  scrapeMissingAssignments: (page: Page, currentQuarter?: string | null) => Promise<unknown[]>;
};

test.describe("missing assignment scraper", () => {
  test("extracts active-quarter and untagged rows without leaking other quarters", async ({ page }) => {
    await page.setContent(`
      <button id="missingAssignments">Missing Assignments</button>
      <table>
        <tr><th>Due</th><th>Assignment</th><th>Class</th><th>Teacher</th><th>Category</th><th>Max Points</th></tr>
        <tr><td>09/01/2026 (Q4)</td><td>Missing Q4 Work</td><td>English</td><td>Teacher</td><td>Homework</td><td>10</td></tr>
        <tr><td>09/02/2026</td><td>Missing Untagged Work</td><td>Math</td><td>Teacher</td><td>Quiz</td><td>20</td></tr>
        <tr><td>08/01/2026 (Q3)</td><td>Old Quarter Work</td><td>Science</td><td>Teacher</td><td>Lab</td><td>30</td></tr>
      </table>
    `);

    const assignments = await scrapeMissingAssignments(page, "Q4") as Array<{
      assignment_name: string;
      due_date: string;
    }>;

    expect(assignments).toEqual([
      expect.objectContaining({ assignment_name: "Missing Q4 Work", due_date: "09/01/2026" }),
      expect.objectContaining({ assignment_name: "Missing Untagged Work", due_date: "09/02/2026" }),
    ]);
  });
});
