import { expect, test } from "@playwright/test";

test.describe("positive points dashboard", () => {
  test("renders points, milestone progress, bonuses, and opportunities", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#points-heading")).toHaveText("GAVIN'S POINTS QUEST");
    await expect(page.locator(".points-value")).toHaveText(/PTS/);
    await expect(page.locator(".milestone-track")).toHaveAttribute("role", "progressbar");
    await expect(page.locator(".point-stats")).toBeVisible();
    await expect(page.locator("#current-badge-heading")).toHaveText("CURRENT CHARACTER");
    await expect(page.locator(".current-badge-panel .badge-card")).toContainText("Piccolo");
    await expect(page.getByRole("link", { name: "OPEN BADGE ROOM", exact: true })).toHaveAttribute("href", "/badges");
    const currentBadgeLink = page.locator(".current-badge-link");
    await expect(currentBadgeLink).toHaveAttribute("href", "/badges");
    await currentBadgeLink.focus();
    await expect(currentBadgeLink).toHaveCSS("outline-style", "solid");
    await expect(page.locator("[data-data-freshness]")).toContainText("DATA UPDATED");
    await expect(page.locator("[data-data-freshness] time")).toContainText(/2026/);
    await expect(page.locator("#opportunity-heading")).toHaveText("POINTS READY TO EARN");
    await expect(page.locator(".points-screen")).not.toContainText("$");
    await expect(page.locator(".points-screen")).not.toContainText("CAN BUY");
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
    await expect(page.locator(".badge-grid .badge-card")).toHaveCount(7);
    await expect(page.locator(".badge-grid .badge-card.is-current")).toContainText("Piccolo");
    await expect(page.locator(".badge-grid .badge-card.is-locked")).not.toHaveCount(0);
    await expect(page.locator(".badge-grid .badge-art")).toHaveCount(7);
    await expect(page.locator(".badge-grid .badge-art").first()).toHaveCSS("border-radius", "12px");
    const portraitRatio = await page.locator(".badge-grid .badge-art").first().evaluate((element) => {
      const { width, height } = element.getBoundingClientRect();
      return width / height;
    });
    expect(portraitRatio).toBeCloseTo(0.8, 1);
    const lockedCards = page.locator(".badge-grid .badge-card.is-locked");
    expect(await lockedCards.evaluateAll((cards) => cards.every((card) => !card.textContent?.includes("Vegeta")))).toBe(true);
    await expect(lockedCards.locator("img")).toHaveCount(0);
    await expect(lockedCards.locator(".badge-placeholder")).toHaveCount(0);
    await expect(lockedCards.locator(".badge-mystery-silhouette")).toHaveCount(5);
    const lockedText = (await lockedCards.allTextContents()).join(" ");
    expect(lockedText).toContain("LOCKED");
    expect(lockedText).toContain("500 PTS TO UNLOCK");
    await expect(page.locator(".badge-grid .badge-card:not(.is-locked)").first()).toContainText("Yamcha");
    await expect(page.locator(".badge-grid .badge-card:not(.is-locked) img").first()).toBeAttached();
    await expect(page.locator(".collection-counts strong")).toHaveText("2 / 7 BADGES COLLECTED");
    await expect(page.locator(".collection-counts span")).toHaveText("5 BADGES REMAINING");
    await expect(page.getByRole("progressbar", { name: "Badge collection progress" }))
      .toHaveAttribute("aria-valuenow", "2");
    await expect(page.getByRole("progressbar", { name: "Badge collection progress" }))
      .toHaveAttribute("aria-valuemin", "0");
    await expect(page.getByRole("progressbar", { name: "Badge collection progress" }))
      .toHaveAttribute("aria-valuemax", "7");
  });

  test("keeps the badge collection summary readable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 428, height: 926 });
    await page.goto("/badges");

    await expect(page.locator(".collection-summary")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    expect(await page.locator(".badge-grid .badge-card.is-locked").count()).toBe(5);
    expect(await page.locator(".badge-grid .badge-card:not(.is-locked)").count()).toBe(2);
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
