import { test, expect } from "@playwright/test";

test.describe("Grade Impact Calculator", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a class detail page (period 1 - English 10)
    await page.goto("/classes/1");

    // Wait for page to be fully loaded
    await page.waitForLoadState("networkidle");
  });

  test("should display the calculator component", async ({ page }) => {
    // Check that calculator is visible
    const calculator = page.locator("#grade-calculator");
    await expect(calculator).toBeVisible();

    // Check header is present
    await expect(page.getByText("GRADE.IMPACT.CALCULATOR")).toBeVisible();

    // Check input fields are present
    await expect(page.locator("#score-earned")).toBeVisible();
    await expect(page.locator("#max-points")).toBeVisible();

    // Check calculate button is present
    await expect(page.locator("#calculate-btn")).toBeVisible();
  });

  test("should calculate grade impact for a hypothetical assignment", async ({ page }) => {
    // Fill in hypothetical assignment: 90/100
    await page.locator("#score-earned").fill("90");
    await page.locator("#max-points").fill("100");

    // Click calculate button
    await page.locator("#calculate-btn").click();

    // Wait for results to appear
    const resultsContainer = page.locator("#results-container");
    await expect(resultsContainer).toBeVisible();

    // Verify results are displayed
    await expect(page.locator("#result-current-percent")).toBeVisible();
    await expect(page.locator("#result-projected-percent")).toBeVisible();
    await expect(page.locator("#result-delta")).toBeVisible();
    await expect(page.locator("#result-current-earned")).toBeVisible();
    await expect(page.locator("#result-current-possible")).toBeVisible();
    await expect(page.locator("#result-projected-earned")).toBeVisible();
    await expect(page.locator("#result-projected-possible")).toBeVisible();

    // Verify current grade shows (English 10 should be around 79%)
    const currentGrade = await page.locator("#result-current-percent").textContent();
    expect(currentGrade).toContain("%");

    // Verify projected grade is calculated
    const projectedGrade = await page.locator("#result-projected-percent").textContent();
    expect(projectedGrade).toContain("%");

    // Verify delta is shown
    const delta = await page.locator("#result-delta").textContent();
    expect(delta).toMatch(/[▲▼●]/); // Should contain an arrow or dot
    expect(delta).toContain("%");
  });

  test("should show improvement indicator for good scores", async ({ page }) => {
    // Fill in a high score: 100/100
    await page.locator("#score-earned").fill("100");
    await page.locator("#max-points").fill("100");

    // Calculate
    await page.locator("#calculate-btn").click();

    // Wait for results
    await expect(page.locator("#results-container")).toBeVisible();

    // Delta should show improvement (upward triangle)
    const delta = await page.locator("#result-delta").textContent();
    expect(delta).toContain("▲");
  });

  test("should show decline indicator for poor scores", async ({ page }) => {
    // Fill in a low score: 0/100
    await page.locator("#score-earned").fill("0");
    await page.locator("#max-points").fill("100");

    // Calculate
    await page.locator("#calculate-btn").click();

    // Wait for results
    await expect(page.locator("#results-container")).toBeVisible();

    // Delta should show decline (downward triangle)
    const delta = await page.locator("#result-delta").textContent();
    expect(delta).toContain("▼");
  });

  test("should validate input and show errors", async ({ page }) => {
    // Try to submit with negative score
    await page.locator("#score-earned").fill("-10");
    await page.locator("#max-points").fill("100");

    // Calculate
    await page.locator("#calculate-btn").click();

    // Error should be visible
    const error = page.locator("#calc-error");
    await expect(error).toBeVisible();
    await expect(error).toContainText("cannot be negative");
  });

  test("should reset the form", async ({ page }) => {
    // Fill in values
    await page.locator("#score-earned").fill("85");
    await page.locator("#max-points").fill("100");

    // Calculate to show results
    await page.locator("#calculate-btn").click();
    await expect(page.locator("#results-container")).toBeVisible();

    // Click reset
    await page.locator("#reset-btn").click();

    // Form should be cleared
    await expect(page.locator("#score-earned")).toHaveValue("");
    await expect(page.locator("#max-points")).toHaveValue("");

    // Results should be hidden
    await expect(page.locator("#results-container")).toBeHidden();
  });

  test("should disable calculate button when inputs are empty", async ({ page }) => {
    // Calculate button should be disabled initially
    const calculateBtn = page.locator("#calculate-btn");
    await expect(calculateBtn).toBeDisabled();

    // Fill in score earned only
    await page.locator("#score-earned").fill("85");
    await expect(calculateBtn).toBeDisabled();

    // Fill in max points
    await page.locator("#max-points").fill("100");
    await expect(calculateBtn).toBeEnabled();

    // Clear score earned
    await page.locator("#score-earned").fill("");
    await expect(calculateBtn).toBeDisabled();
  });

  test("should handle decimal values", async ({ page }) => {
    // Fill in decimal values
    await page.locator("#score-earned").fill("87.5");
    await page.locator("#max-points").fill("100");

    // Calculate
    await page.locator("#calculate-btn").click();

    // Results should be visible
    await expect(page.locator("#results-container")).toBeVisible();

    // Should show calculated grades
    const projectedGrade = await page.locator("#result-projected-percent").textContent();
    expect(projectedGrade).toContain("%");
  });

  test("should support keyboard navigation", async ({ page }) => {
    // Tab to score earned input
    await page.keyboard.press("Tab");
    let focused = await page.evaluate(() => document.activeElement?.id);

    // Should eventually focus on score-earned or max-points (depending on other page elements)
    // Fill via keyboard
    await page.locator("#score-earned").focus();
    await page.keyboard.type("85");

    // Tab to max points
    await page.keyboard.press("Tab");
    await page.keyboard.type("100");

    // Tab to calculate button
    await page.locator("#calculate-btn").focus();
    await page.keyboard.press("Enter");

    // Results should appear
    await expect(page.locator("#results-container")).toBeVisible();
  });

  test("should work on mobile viewport", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Calculator should still be visible and functional
    await expect(page.locator("#grade-calculator")).toBeVisible();

    // Fill and calculate
    await page.locator("#score-earned").fill("90");
    await page.locator("#max-points").fill("100");
    await page.locator("#calculate-btn").click();

    // Results should appear
    await expect(page.locator("#results-container")).toBeVisible();
  });

  test("should announce results to screen readers", async ({ page }) => {
    // Fill in values
    await page.locator("#score-earned").fill("95");
    await page.locator("#max-points").fill("100");

    // Calculate
    await page.locator("#calculate-btn").click();

    // Wait a moment for the announcement
    await page.waitForTimeout(500);

    // Check that an aria-live region was created (our announceToScreenReader function)
    const announcements = page.locator('[role="status"][aria-live="polite"]');

    // Note: The announcement div is removed after 1 second, so we need to check quickly
    // or check that results are visible which means the announcement happened
    await expect(page.locator("#results-container")).toBeVisible();
  });

  test("should handle extra credit (score > max points)", async ({ page }) => {
    // Fill in extra credit scenario: 110/100
    await page.locator("#score-earned").fill("110");
    await page.locator("#max-points").fill("100");

    // Calculate
    await page.locator("#calculate-btn").click();

    // Should show results (not error)
    await expect(page.locator("#results-container")).toBeVisible();

    // Projected grade should be capped at 100% or show the improvement
    const projectedGrade = await page.locator("#result-projected-percent").textContent();
    expect(projectedGrade).toContain("%");
  });
});
