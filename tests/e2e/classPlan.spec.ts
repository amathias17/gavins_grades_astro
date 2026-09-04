import { expect, test } from "@playwright/test";

test.describe("class plan", () => {
  test("uses the current study-room styling and omits the embedded calculator", async ({ page }) => {
    await page.goto("/classes/3");

    await expect(page.locator(".class-page")).toBeVisible();
    await expect(page.locator("#class-title")).toHaveText("Chemistry 2");
    await expect(page.locator("#grade-calculator")).toHaveCount(0);
    await expect(page.locator(".class-header-card")).toHaveCSS("border-radius", "16px");
    await expect(page.locator(".assignments-panel")).toBeVisible();
    await expect(page.locator(".assignment-status").first()).toBeVisible();
    await expect(page.locator(".assignment-impact-button")).toHaveCount(7);
    await expect(page.locator(".assignment-impact-button", { hasText: "Create your own Lab coat" })).toHaveCount(0);
    await expect(page.locator(".assignments-panel .grade-badge").first()).toHaveCSS("border-radius", "999px");
    await expect(page.locator(".assignment-status.is-missing")).toHaveCount(4);
    await expect(page.locator(".assignments-row").filter({ hasText: "Lab Safety Rules Packet" }).filter({ hasText: "09/03/2026" })).toContainText("MISSING");
    await expect(page.locator(".assignments-row").filter({ hasText: "1WS#1-SafetySymbols&Procedures" })).toContainText("MISSING");
    await expect(page.locator(".assignments-row").filter({ hasText: "Signed Lab Safety Contract" })).toContainText("MISSING");
    await expect(page.locator(".assignments-row").filter({ hasText: "Safety in the Lab Practice" })).toContainText("MISSING");
    await expect(page.locator(".assignment-status.is-graded")).toHaveCount(3);
  });

  test("keeps duplicate-period class plans separate", async ({ page }) => {
    await page.goto("/classes/1-heroes-monsters");
    await expect(page.locator("#class-title")).toHaveText("Heroes & Monsters");
    await expect(page.locator(".assignment-impact-button")).toHaveCount(0);

    await page.goto("/classes/1-environ-science-1");
    await expect(page.locator("#class-title")).toHaveText("Environ Science 1");
    await expect(page.locator(".assignment-impact-button")).toHaveCount(7);
  });

  test("keeps assignment impact interaction accessible", async ({ page }) => {
    await page.goto("/classes/3");
    const assignment = page.locator(".assignment-impact-button").first();
    await assignment.focus();
    await expect(assignment).toBeFocused();
    await assignment.click();
    await expect(page.locator("#assignment-impact-modal")).toHaveClass(/is-open/);
    await expect(page.locator("#assignment-impact-title")).toHaveText("ASSIGNMENT IMPACT");
    await page.locator("#assignment-impact-close").click();
    await expect(page.locator("#assignment-impact-modal")).not.toHaveClass(/is-open/);
  });

  test("stays within the viewport on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/classes/3");
    expect(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
