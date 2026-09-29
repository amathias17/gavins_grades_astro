import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { extractAssignmentDetails, fetchAssignmentDetails, mapWithConcurrency, parseAssignmentDetails, getAssignmentScoreHint, assignmentFingerprint, canUseCachedAssignment, scrapeAllAssignments } = require("../../scraper/enhanced-scraper.cjs") as {
  extractAssignmentDetails: (page: import("@playwright/test").Page, assignmentId: string, classId: string, options?: { dialogTimeoutMs?: number }) => Promise<{
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
  scrapeAllAssignments: (page: import("@playwright/test").Page, classes: unknown[], cacheAssignments?: Record<string, unknown>) => Promise<unknown>;
};

test.describe("assignment detail scraper", () => {
  test("uses the visible assignment dialog instead of a hidden stale dialog", async ({ page }) => {
    await page.setContent(`
      <a id="showAssignmentInfo" data-aid="assignment-1" data-gid="class-1" onclick="document.querySelector('#current-dialog').style.display = 'block'">Selected assignment</a>
      <div class="sf_Dialog" style="display:none">Points Earned: 9 / 10</div>
      <div id="current-dialog" class="sf_Dialog" role="dialog" style="display:none; width:200px; height:100px">Points Earned: 0 / 10<button class="sf_DialogClose" onclick="this.parentElement.remove()">Close</button></div>
    `);

    const details = await extractAssignmentDetails(page, "assignment-1", "class-1");

    expect(details).toMatchObject({ graded: true, earnedPoints: 0, totalPoints: 10 });
  });

  test("retries a link that opens no dialog on the first click", async ({ page }) => {
    await page.setContent(`
      <a id="showAssignmentInfo" data-aid="slow" data-gid="class-1" onclick="window.clickCount = (window.clickCount || 0) + 1; if (window.clickCount === 2) document.querySelector('.sf_Dialog').style.display = 'block'">Slow assignment</a>
      <div class="sf_Dialog" role="dialog" style="display:none">Points Earned: 6 / 8<button class="sf_DialogClose" onclick="this.parentElement.remove()">Close</button></div>
    `);

    await expect(extractAssignmentDetails(page, "slow", "class-1", { dialogTimeoutMs: 100 })).resolves.toMatchObject({ earnedPoints: 6, totalPoints: 8 });
    expect(await page.evaluate(() => (window as unknown as { clickCount: number }).clickCount)).toBe(2);
    expect(page.isClosed()).toBe(false);
  });

  test("reports an assignment whose dialog never opens", async ({ page }) => {
    await page.setContent('<a id="showAssignmentInfo" data-aid="unavailable" data-gid="class-1" onclick="window.clickCount = (window.clickCount || 0) + 1">Unavailable assignment</a>');

    await expect(extractAssignmentDetails(page, "unavailable", "class-1", { dialogTimeoutMs: 100 })).rejects.toThrow(/after 2 clicks/);
    expect(await page.evaluate(() => (window as unknown as { clickCount: number }).clickCount)).toBe(2);
    expect(page.isClosed()).toBe(false);
  });

  test("closes only the visible assignment dialog across sequential fallbacks", async ({ page }) => {
    await page.setContent(`
      <a id="page-close" class="sf_DialogClose" onclick="window.pageCloseCount = (window.pageCloseCount || 0) + 1">Close</a>
      <a id="showAssignmentInfo" data-aid="first" data-gid="class-1" onclick="openDialog('first')">First</a>
      <a id="showAssignmentInfo" data-aid="second" data-gid="class-1" onclick="openDialog('second')">Second</a>
      <script>
        function openDialog(id) {
          const dialog = document.createElement('div');
          dialog.className = 'sf_Dialog';
          dialog.setAttribute('role', 'dialog');
          dialog.innerHTML = 'Points Earned: 4 / 5 <a class="sf_DialogClose" onclick="this.parentElement.remove()">Close</a>';
          document.body.append(dialog);
        }
      </script>
    `);

    for (const assignmentId of ["first", "second"]) {
      await expect(extractAssignmentDetails(page, assignmentId, "class-1")).resolves.toMatchObject({ earnedPoints: 4, totalPoints: 5 });
      expect(page.isClosed()).toBe(false);
      await expect(page.locator('.sf_Dialog:visible')).toHaveCount(0);
    }
    expect(await page.evaluate(() => (window as unknown as { pageCloseCount?: number }).pageCloseCount ?? 0)).toBe(0);
  });

  test("uses Escape only while an assignment dialog is visible", async ({ page }) => {
    await page.setContent(`
      <button id="page-close" onclick="window.pageCloseCount = (window.pageCloseCount || 0) + 1">Close</button>
      <a id="showAssignmentInfo" data-aid="first" data-gid="class-1" onclick="document.querySelector('.sf_Dialog').style.display = 'block'">First</a>
      <div class="sf_Dialog" role="dialog" style="display:none">Points Earned: 2 / 3</div>
      <script>document.addEventListener('keydown', event => { if (event.key === 'Escape') document.querySelector('.sf_Dialog').style.display = 'none'; });</script>
    `);

    await expect(extractAssignmentDetails(page, "first", "class-1")).resolves.toMatchObject({ earnedPoints: 2, totalPoints: 3 });
    expect(page.isClosed()).toBe(false);
    expect(await page.evaluate(() => (window as unknown as { pageCloseCount?: number }).pageCloseCount ?? 0)).toBe(0);
    await expect(page.locator('.sf_Dialog:visible')).toHaveCount(0);
  });

  test("stops immediately when the gradebook page closes during fallback", async ({ page }) => {
    page.on("console", message => {
      if (message.text() === "close-gradebook") void page.close();
    });
    await page.setContent(`
      <table><tbody>
        <tr><td><a id="showAssignmentInfo" data-aid="first" data-gid="class-1" onclick="console.log('close-gradebook')">First</a></td></tr>
        <tr><td><a id="showAssignmentInfo" data-aid="second" data-gid="class-1">Second</a></td></tr>
      </tbody></table>
    `);
    const cache = {};

    await expect(scrapeAllAssignments(page, [], cache)).rejects.toThrow(/closed/i);
    expect(page.isClosed()).toBe(true);
    expect(cache).toEqual({});
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

  test("probes and reuses an element-based Skyward request contract", async ({ page }) => {
    await page.setContent('<a id="showAssignmentInfo" data-aid="assignment-2" data-gid="class-2">Assignment</a>');
    await page.evaluate(() => {
      (window as unknown as { sff: unknown }).sff = {
        request: (target: unknown, callback: (html: string) => void) => {
          if (target instanceof HTMLAnchorElement) callback("<div>Points Earned: 3 / 4</div>");
        }
      };
    });
    const details = await fetchAssignmentDetails(page, { entityId: "entity-2", studentId: "student-2", classId: "class-2", assignmentId: "assignment-2" }, { retries: 1, timeoutMs: 5000, modeTimeoutMs: 100 });
    expect(details).toMatchObject({ graded: true, earnedPoints: 3, totalPoints: 4 });
    await expect.poll(() => page.evaluate(() => (window as unknown as { __skywardDetailRequestMode: string }).__skywardDetailRequestMode)).toBe("element");
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
