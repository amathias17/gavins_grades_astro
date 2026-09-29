import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { extractAssignmentDetails, fetchAssignmentDetails, mapWithConcurrency, parseAssignmentDetails, getAssignmentScoreHint, assignmentFingerprint, canUseCachedAssignment } = require("../../scraper/enhanced-scraper.cjs") as {
  extractAssignmentDetails: (page: import("@playwright/test").Page, assignmentId: string, classId: string) => Promise<{
    graded: boolean;
    earnedPoints: number | null;
    totalPoints: number | null;
  }>;
  fetchAssignmentDetails: (page: import("@playwright/test").Page, assignment: Record<string, unknown>, options?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  mapWithConcurrency: <T>(items: T[], concurrency: number, worker: (item: T) => Promise<unknown>) => Promise<Array<{ value?: unknown; error?: Error }>>;
  parseAssignmentDetails: (html: string) => { graded: boolean; earnedPoints: number | null; totalPoints: number | null; weight: number | null; dateDue: string | null; hasStar: boolean };
  getAssignmentScoreHint: (text: string) => { status: string; totalPoints: number | null };
  assignmentFingerprint: (assignment: Record<string, unknown>) => Record<string, unknown>;
  canUseCachedAssignment: (assignment: Record<string, unknown>, cached: Record<string, unknown>, forceRefresh?: boolean) => boolean;
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
    expect(getAssignmentScoreHint("Selected assignment 0/10")).toEqual({ status: "graded", earnedPoints: 0, totalPoints: 10 });
    expect(getAssignmentScoreHint("Selected assignment 9/10")).toEqual({ status: "graded", earnedPoints: 9, totalPoints: 10 });
    expect(getAssignmentScoreHint("Due 09/01/2026")).toEqual({ status: "unknown", totalPoints: null });
  });

  test("parses returned HTML without confusing dates or stars for scores", () => {
    expect(parseAssignmentDetails("<div>Total Points: 10</div><div>Grade: 80%</div><div>Weight: 15%</div><div>Date Due: 09/12/2026</div>")).toMatchObject({
      graded: true, earnedPoints: 8, totalPoints: 10, weight: 15, dateDue: "09/12/2026", hasStar: false
    });
    expect(parseAssignmentDetails("<div>Points Earned: 0 / 10</div>")).toMatchObject({ graded: true, earnedPoints: 0, totalPoints: 10, hasStar: false });
    expect(parseAssignmentDetails("<div>Points Earned: * / 10</div>")).toMatchObject({ graded: false, earnedPoints: 0, totalPoints: 10, hasStar: true });
  });

  test("uses the authenticated page request and preserves entity id arguments", async ({ page }) => {
    await page.evaluate(() => {
      (window as unknown as { sff: unknown }).sff = {
        request: (args: unknown, callback: (html: string) => void) => {
          (window as unknown as { lastSffArgs: unknown }).lastSffArgs = args;
          callback("<div>Points Earned: 4 / 5</div>");
        }
      };
    });
    const details = await fetchAssignmentDetails(page, { entityId: "entity-1", studentId: "student-1", classId: "class-1", assignmentId: "assignment-1" }, { retries: 1, timeoutMs: 1000 });
    expect(details).toMatchObject({ graded: true, earnedPoints: 4, totalPoints: 5 });
    await expect.poll(() => page.evaluate(() => (window as unknown as { lastSffArgs: Record<string, string> }).lastSffArgs)).toMatchObject({ eid: "entity-1", sid: "student-1", gid: "class-1", aid: "assignment-1" });
  });

  test("bounds direct request workers", async () => {
    let active = 0;
    let maximum = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise(resolve => setTimeout(resolve, 10));
      active -= 1;
      return true;
    });
    expect(maximum).toBe(2);
    expect(results).toHaveLength(5);
    expect(results.every(result => result.value === true)).toBe(true);
  });

  test("reuses unchanged graded and ungraded rows, but invalidates every meaningful change", () => {
    const base = { assignmentId: "a", classId: "c", studentId: "s", name: "Quiz", dueDate: "09/01/2026", rowScoreHint: { status: "graded", earnedPoints: 7, totalPoints: 10 } };
    const cached = { ...base, fingerprint: assignmentFingerprint(base), graded: true, earnedPoints: 7, totalPoints: 10 };
    expect(canUseCachedAssignment(base, cached)).toBe(true);
    expect(canUseCachedAssignment({ ...base, rowScoreHint: { status: "ungraded", totalPoints: 10 } }, { ...cached, fingerprint: assignmentFingerprint({ ...base, rowScoreHint: { status: "ungraded", totalPoints: 10 } }) })).toBe(true);
    expect(canUseCachedAssignment({ ...base, rowScoreHint: { status: "graded", earnedPoints: 0, totalPoints: 10 } }, cached)).toBe(false);
    expect(canUseCachedAssignment({ ...base, name: "Renamed" }, cached)).toBe(false);
    expect(canUseCachedAssignment({ ...base, dueDate: "09/02/2026" }, cached)).toBe(false);
    expect(canUseCachedAssignment({ ...base, rowScoreHint: { status: "graded", earnedPoints: 7, totalPoints: 11 } }, cached)).toBe(false);
    const previousForceRefresh = process.env.SKYWARD_FORCE_REFRESH;
    process.env.SKYWARD_FORCE_REFRESH = "1";
    try {
      expect(canUseCachedAssignment(base, cached)).toBe(false);
    } finally {
      if (previousForceRefresh === undefined) delete process.env.SKYWARD_FORCE_REFRESH;
      else process.env.SKYWARD_FORCE_REFRESH = previousForceRefresh;
    }
  });
});
