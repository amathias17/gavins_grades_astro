import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { getBadgeMilestoneProgress } from "../../src/utils/badgeMilestones";
import { getBadgeStates, getCurrentBadge } from "../../src/utils/badges";
import { formatQuestPointDisplay } from "../../src/utils/questPointDisplay";

async function readDisplayedPoints(page: Page, selector: string): Promise<number> {
  const text = await page.locator(selector).innerText();
  const match = text.match(/[\d,]+(?:\.\d+)?/);
  if (!match) throw new Error(`Could not read displayed points from ${selector}`);
  return Number(match[0].replaceAll(",", ""));
}

test.describe("positive points dashboard", () => {
  test("rounds quest point display values without changing precise progress values", () => {
    expect(formatQuestPointDisplay(1234.49)).toBe("1,234");
    expect(formatQuestPointDisplay(1234.5)).toBe("1,235");
  });

  test("renders points, milestone progress, bonuses, and opportunities", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#points-heading")).toHaveText("GAVIN'S POINTS QUEST");
    await expect(page.locator(".points-value")).toHaveText(/PTS/);
    const milestoneTrack = page.locator(".milestone-track");
    await expect(milestoneTrack).toHaveAttribute("role", "progressbar");
    const precisePoints = Number(await milestoneTrack.getAttribute("aria-valuenow"));
    const expectedMilestone = getBadgeMilestoneProgress(precisePoints);
    await expect(readDisplayedPoints(page, ".points-value")).resolves.toBe(Math.round(precisePoints));
    if (expectedMilestone.nextMilestone !== null) {
      await expect(page.locator("#level-heading")).toHaveText("NEXT BADGE UNLOCK");
      await expect(milestoneTrack).toHaveAttribute("aria-label", `Progress to badge unlock at ${expectedMilestone.nextMilestone} points`);
      await expect(milestoneTrack).toHaveAttribute("aria-valuemin", String(expectedMilestone.previousMilestone));
      await expect(milestoneTrack).toHaveAttribute("aria-valuemax", String(expectedMilestone.nextMilestone));
      await expect(milestoneTrack).toHaveAttribute("aria-valuenow", String(Math.min(precisePoints, expectedMilestone.nextMilestone!)));
    } else {
      await expect(page.locator("#level-heading")).toHaveText("BADGE COLLECTION COMPLETE");
      await expect(milestoneTrack).toHaveAttribute("aria-label", "Badge collection complete");
    }
    expect(await milestoneTrack.locator("span").evaluate((element) => (element as HTMLElement).style.width))
      .toBe(`${expectedMilestone.milestoneProgressPercent}%`);
    await expect(page.locator(".point-stats")).toBeVisible();
    await expect(page.locator(".points-encouragement + .data-freshness")).toContainText("DATA UPDATED");
    await expect(page.locator(".points-hero [data-data-freshness] time")).toContainText(/2026/);
    await expect(page.locator(".current-badge-panel")).not.toContainText("CURRENT CHARACTER");
    await expect(page.locator(".current-badge-panel .badge-card")).toContainText(getCurrentBadge(precisePoints).characterName);
    await expect(page.locator(".current-badge-panel .badge-card")).not.toContainText("CURRENT BADGE");
    await expect(page.getByRole("link", { name: "OPEN BADGE ROOM", exact: true })).toHaveAttribute("href", "/badges");
    const currentBadgeLink = page.locator(".current-badge-link");
    await expect(currentBadgeLink).toHaveAttribute("href", "/badges");
    await currentBadgeLink.focus();
    await expect(currentBadgeLink).toHaveCSS("outline-style", "solid");
    await expect(page.locator("#opportunity-heading")).toHaveText("POINTS READY TO EARN");
    await expect(page.getByRole("link", { name: "View current grades by class" })).toHaveAttribute("href", "/grades");
    await expect(page.getByRole("link", { name: "View current grades by class" })).toHaveText("VIEW CURRENT GRADES");
    await expect(page.locator(".points-screen")).not.toContainText("$");
    await expect(page.locator(".points-screen")).not.toContainText("CAN BUY");
    const lockedNames = getBadgeStates(precisePoints).filter((badge) => !badge.unlocked).map((badge) => badge.characterName);
    const dashboardText = await page.locator(".points-screen").innerText();
    for (const characterName of lockedNames) expect(dashboardText).not.toContain(characterName);
    await page.getByRole("button", { name: "HOW POINTS WORK" }).click({ force: true });
    for (const characterName of lockedNames) await expect(page.getByRole("dialog")).not.toContainText(characterName);
  });

  test("opens Badge Room when the current badge card is activated", async ({ page }) => {
    await page.goto("/");
    const currentBadgeLink = page.locator(".current-badge-link");
    await currentBadgeLink.focus();
    await currentBadgeLink.press("Enter");
    await expect(page).toHaveURL(/\/badges\/?$/);
  });

  test("renders the full badge room with locked states", async ({ page }) => {
    await page.goto("/badges");
    await expect(page.locator("#badge-room-title")).toHaveText("BADGE ROOM");
    const points = await readDisplayedPoints(page, ".badge-room-header .badge-room-kicker");
    const badgeStates = getBadgeStates(points);
    const unlockedCount = badgeStates.filter((badge) => badge.unlocked).length;
    const lockedCount = badgeStates.length - unlockedCount;
    await expect(page.locator(".badge-grid .badge-card")).toHaveCount(badgeStates.length);
    await expect(page.locator(".badge-grid .badge-card.is-current")).toContainText(getCurrentBadge(points).characterName);
    await expect(page.locator(".badge-grid .badge-card.is-locked")).toHaveCount(lockedCount);
    await expect(page.locator(".badge-grid .badge-art")).toHaveCount(badgeStates.length);
    await expect(page.locator(".badge-grid .badge-art").first()).toHaveCSS("border-radius", "12px");
    const portraitRatio = await page.locator(".badge-grid .badge-art").first().evaluate((element) => {
      const { width, height } = element.getBoundingClientRect();
      return width / height;
    });
    expect(portraitRatio).toBeCloseTo(0.8, 1);
    const lockedCards = page.locator(".badge-grid .badge-card.is-locked");
    await expect(lockedCards.locator("img")).toHaveCount(0);
    await expect(lockedCards.locator(".badge-placeholder")).toHaveCount(0);
    await expect(lockedCards.locator(".badge-mystery-silhouette")).toHaveCount(lockedCount);
    const nextBadge = badgeStates.find((badge) => !badge.unlocked);
    if (lockedCount > 0) {
      const lockedText = (await lockedCards.allTextContents()).join(" ");
      const lockedAccessibleNames = await lockedCards.evaluateAll((cards) => cards.map((card) => card.getAttribute("aria-label") ?? "").join(" "));
      expect(lockedText).toContain("LOCKED");
      badgeStates.filter((badge) => badge.unlocked).forEach((badge) => expect(lockedText).not.toContain(badge.characterName));
      badgeStates.filter((badge) => !badge.unlocked).forEach((badge) => {
        expect(lockedText).not.toContain(badge.characterName);
        expect(lockedAccessibleNames).not.toContain(badge.characterName);
      });
      if (nextBadge) expect(lockedText).toContain(`${nextBadge.unlockPoints.toLocaleString()} PTS TO UNLOCK`);
    }
    await expect(page.locator(".badge-grid .badge-card:not(.is-locked)").first()).toContainText("Yamcha");
    await expect(page.locator(".badge-grid .badge-card:not(.is-locked) img").first()).toBeAttached();
    await expect(page.locator(".badge-grid .badge-card:not(.is-locked) .badge-stats").first()).toContainText("AFFILIATION");
    await expect(page.locator(".badge-grid .badge-card:not(.is-locked) .badge-stats").first()).toContainText("BASE KI");
    await expect(page.locator(".badge-grid .badge-card:not(.is-locked) .badge-stats").first()).toContainText("TOTAL KI");
    await expect(page.locator(".badge-grid .badge-card.is-locked .badge-stats")).toHaveCount(0);
    await expect(page.locator(".badge-grid .badge-card:not(.is-locked) img").first()).toHaveCSS("opacity", "1");
    await expect(page.locator(".badge-grid .badge-profile-link")).toHaveCount(unlockedCount);
    await expect(lockedCards.locator("xpath=ancestor::a")).toHaveCount(0);
    await expect(page.locator(".collection-counts strong")).toHaveText(`${unlockedCount} / ${badgeStates.length} BADGES COLLECTED`);
    await expect(page.locator(".collection-counts span")).toHaveText(`${lockedCount} BADGES REMAINING`);
    await expect(page.getByRole("progressbar", { name: "Badge collection progress" }))
      .toHaveAttribute("aria-valuenow", String(unlockedCount));
    await expect(page.getByRole("progressbar", { name: "Badge collection progress" }))
      .toHaveAttribute("aria-valuemin", "0");
    await expect(page.getByRole("progressbar", { name: "Badge collection progress" }))
      .toHaveAttribute("aria-valuemax", String(badgeStates.length));
  });

  test("opens unlocked fighter biographies and keeps locked routes unavailable", async ({ page }) => {
    await page.goto("/badges");
    const points = await readDisplayedPoints(page, ".badge-room-header .badge-room-kicker");
    const badgeStates = getBadgeStates(points);
    const firstUnlocked = badgeStates.find((badge) => badge.unlocked)!;
    const firstLocked = badgeStates.find((badge) => !badge.unlocked);
    const biographyLink = page.getByRole("link", { name: `Open ${firstUnlocked.characterName} biography` }).last();

    await biographyLink.focus();
    await expect(biographyLink).toBeFocused();
    await biographyLink.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/badges/${firstUnlocked.id}/?$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(firstUnlocked.characterName);
    await expect(page.getByRole("heading", { name: "Biography" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Interesting facts" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Transformations" })).toBeVisible();
    await expect(page.getByRole("link", { name: "BACK TO BADGE ROOM" })).toHaveAttribute("href", "/badges");

    if (firstLocked) {
      const response = await page.goto(`/badges/${firstLocked.id}`);
      expect(response?.status()).toBe(404);
    }
  });

  test("keeps the badge collection summary readable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 428, height: 926 });
    await page.goto("/badges");

    await expect(page.locator(".collection-summary")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    const points = await readDisplayedPoints(page, ".badge-room-header .badge-room-kicker");
    const badgeStates = getBadgeStates(points);
    expect(await page.locator(".badge-grid .badge-card.is-locked").count()).toBe(badgeStates.filter((badge) => !badge.unlocked).length);
    expect(await page.locator(".badge-grid .badge-card:not(.is-locked)").count()).toBe(badgeStates.filter((badge) => badge.unlocked).length);
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
    await expect(dialog.locator(".breakdown-summary")).toContainText("PERIOD POSSIBLE");
    await expect(dialog.locator(".breakdown-summary")).toContainText("READY TO EARN");
    await expect(dialog.locator(".breakdown-summary")).toContainText("AWAITING GRADES");
    await expect(dialog.locator(".breakdown-summary")).toContainText("TOTAL POINTS EARNED");
    await expect(dialog.locator(".breakdown-class")).not.toHaveCount(0);
    await expect(dialog.locator(".breakdown-class li")).not.toHaveCount(0);
    await expect(dialog.getByText("OPEN", { exact: true })).toHaveCount(0);
    await expect(dialog.locator(".breakdown-class li").filter({ hasText: "Signed Syllabus" })).toContainText("0 / 5 PTS");
    await expect(dialog.locator(".breakdown-class li").filter({ hasText: "Signed Syllabus" }).locator(".breakdown-status")).toHaveText("MISSING");
    await expect(dialog.locator(".breakdown-class li").filter({ hasText: "Create your own Lab coat" })).toContainText("9 / 10 PTS");
    await expect(dialog.locator(".breakdown-class li").filter({ hasText: "Create your own Lab coat" }).locator(".breakdown-status")).toHaveText("COMPLETED");
    await expect(dialog.locator(".breakdown-class li").filter({ hasText: "Virtual Simulator mini-lab" })).toContainText("0 / 10 PTS");
    await expect(dialog.locator(".breakdown-class li").filter({ hasText: "Virtual Simulator mini-lab" }).locator(".breakdown-status")).toHaveText("NOT GRADED");
    await expect(dialog.locator(".breakdown-class li").filter({ hasText: '"Supervolcanoes" Sky Show' })).toContainText("5 / 5 PTS");

    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test("keeps all opportunity cards readable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 428, height: 926 });
    await page.goto("/");

    const dialog = page.locator("#opportunities-dialog");
    await dialog.evaluate((element) => (element as HTMLDialogElement).showModal());
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".opportunity-dialog-list li")).toHaveCount(6);
    await expect(dialog.locator(".opportunity-dialog-list")).toContainText("Virtual Simulator mini-lab");
    await expect(dialog.locator(".opportunity-dialog-list")).toContainText("09/03/2026");
    await expect(dialog.locator(".opportunity-dialog-list .opportunity-status").first()).toHaveText(/MISSING|NOT GRADED/);
    await expect(dialog.locator(".opportunity-dialog-list .opportunity-points").first()).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);

    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).not.toBeVisible();
  });
});
