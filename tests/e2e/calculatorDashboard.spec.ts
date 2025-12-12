import { test, expect } from "@playwright/test";

test.describe("Grade Impact Calculator Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the calculator dashboard
    await page.goto("/calculator");
    await page.waitForLoadState("networkidle");
  });

  test("should render the dashboard page with all sections", async ({
    page,
  }) => {
    // Check page title/header
    await expect(
      page.getByText("Grade.Impact.Dashboard")
    ).toBeVisible();

    // Check all major sections are present
    await expect(page.getByText("SELECT.CLASS")).toBeVisible();
    await expect(page.getByText("HYPOTHETICAL.ASSIGNMENT")).toBeVisible();
    await expect(page.getByText("Ready Player One")).toBeVisible(); // Empty state

    // Check form inputs are present
    await expect(page.locator("#class-selector")).toBeVisible();
    await expect(page.locator("#score-earned")).toBeVisible();
    await expect(page.locator("#max-points")).toBeVisible();

    // Check buttons are present
    await expect(page.locator("#calculate-btn")).toBeVisible();
    await expect(page.locator("#reset-btn")).toBeVisible();
  });

  test("should have proper accessibility attributes", async ({ page }) => {
    // Check ARIA labels
    const classSelector = page.locator("#class-selector");
    await expect(classSelector).toHaveAttribute(
      "aria-label",
      "Select class for grade calculation"
    );

    // Check form inputs have labels
    await expect(page.locator('label[for="score-earned"]')).toBeVisible();
    await expect(page.locator('label[for="max-points"]')).toBeVisible();
    await expect(page.locator('label[for="class-selector"]')).toBeVisible();

    // Check helper text
    await expect(page.locator("#score-help")).toBeVisible();
    await expect(page.locator("#max-help")).toBeVisible();
  });

  test("should show back navigation link", async ({ page }) => {
    const backLink = page.getByRole("link", { name: /BACK TO DASHBOARD/ });
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveAttribute("href", "/");
  });

  test("should populate class selector with all classes", async ({ page }) => {
    const selector = page.locator("#class-selector");

    // Should have placeholder option
    const options = await selector.locator("option").all();
    expect(options.length).toBeGreaterThan(1); // At least placeholder + some classes

    // Check first option is placeholder
    const firstOption = await options[0].textContent();
    expect(firstOption).toContain("Select a Class");

    // Check that classes have percentage in name
    const secondOption = await options[1].textContent();
    expect(secondOption).toMatch(/\d+%/); // Should contain percentage
  });

  test("should disable calculate button until all inputs are filled", async ({
    page,
  }) => {
    const calculateBtn = page.locator("#calculate-btn");

    // Should be disabled initially
    await expect(calculateBtn).toBeDisabled();

    // Select a class
    await page.locator("#class-selector").selectOption({ index: 1 });
    await expect(calculateBtn).toBeDisabled(); // Still disabled

    // Fill score earned
    await page.locator("#score-earned").fill("85");
    await expect(calculateBtn).toBeDisabled(); // Still disabled

    // Fill max points
    await page.locator("#max-points").fill("100");
    await expect(calculateBtn).toBeEnabled(); // Now enabled

    // Clear an input
    await page.locator("#score-earned").fill("");
    await expect(calculateBtn).toBeDisabled(); // Disabled again
  });

  test("should show current class info when class is selected", async ({
    page,
  }) => {
    // Current class info should be hidden initially
    const classInfo = page.locator("#current-class-info");
    await expect(classInfo).toBeHidden();

    // Select a class
    await page.locator("#class-selector").selectOption({ index: 1 });

    // Current class info should now be visible
    await expect(classInfo).toBeVisible();

    // Should show letter grade and percentage
    await expect(page.locator("#current-class-letter")).toBeVisible();
    await expect(page.locator("#current-class-percent")).toBeVisible();
    await expect(page.locator("#current-class-teacher")).toBeVisible();
  });

  test("should calculate grade impact end-to-end", async ({ page }) => {
    // Select first class (English 10 - should be around 79%)
    await page.locator("#class-selector").selectOption({ index: 1 });

    // Fill in hypothetical assignment: 90/100
    await page.locator("#score-earned").fill("90");
    await page.locator("#max-points").fill("100");

    // Calculate
    await page.locator("#calculate-btn").click();

    // Wait for results to appear
    const resultsDisplay = page.locator("#results-display");
    await expect(resultsDisplay).toBeVisible();

    // Empty state should be hidden
    const emptyState = page.locator("#empty-state");
    await expect(emptyState).toBeHidden();

    // Results should show IMPACT.ANALYSIS header
    await expect(page.getByText("IMPACT.ANALYSIS")).toBeVisible();

    // All result elements should have content
    await expect(page.locator("#result-current-letter")).toBeVisible();
    await expect(page.locator("#result-current-percent")).toBeVisible();
    await expect(page.locator("#result-projected-letter")).toBeVisible();
    await expect(page.locator("#result-projected-percent")).toBeVisible();
    await expect(page.locator("#result-delta")).toBeVisible();

    // Progress bar should be visible and have width
    const progressBar = page.locator("#result-progress");
    await expect(progressBar).toBeVisible();
    const width = await progressBar.evaluate((el) => el.style.width);
    expect(width).not.toBe("0%");
    expect(width).not.toBe("");
  });

  test("should show improvement indicator for high score", async ({ page }) => {
    // Select a class
    await page.locator("#class-selector").selectOption({ index: 1 });

    // Enter perfect score
    await page.locator("#score-earned").fill("100");
    await page.locator("#max-points").fill("100");

    // Calculate
    await page.locator("#calculate-btn").click();

    // Wait for results
    await expect(page.locator("#results-display")).toBeVisible();

    // Delta should show improvement (upward triangle)
    const delta = await page.locator("#result-delta").textContent();
    expect(delta).toContain("▲");

    // Delta label should say "Improvement"
    const deltaLabel = await page.locator("#result-delta-label").textContent();
    expect(deltaLabel).toBe("Improvement");
  });

  test("should show decline indicator for low score", async ({ page }) => {
    // Select a class
    await page.locator("#class-selector").selectOption({ index: 1 });

    // Enter failing score
    await page.locator("#score-earned").fill("0");
    await page.locator("#max-points").fill("100");

    // Calculate
    await page.locator("#calculate-btn").click();

    // Wait for results
    await expect(page.locator("#results-display")).toBeVisible();

    // Delta should show decline (downward triangle)
    const delta = await page.locator("#result-delta").textContent();
    expect(delta).toContain("▼");

    // Delta label should say "Decline"
    const deltaLabel = await page.locator("#result-delta-label").textContent();
    expect(deltaLabel).toBe("Decline");
  });

  test("should validate input and show errors", async ({ page }) => {
    // Select a class
    await page.locator("#class-selector").selectOption({ index: 1 });

    // Try negative score
    await page.locator("#score-earned").fill("-10");
    await page.locator("#max-points").fill("100");

    // Calculate
    await page.locator("#calculate-btn").click();

    // Error should be visible
    const error = page.locator("#calc-error");
    await expect(error).toBeVisible();
    await expect(error).toContainText("cannot be negative");
  });

  test("should require class selection before calculating", async ({
    page,
  }) => {
    // Don't select a class, just fill inputs
    await page.locator("#score-earned").fill("85");
    await page.locator("#max-points").fill("100");

    // Calculate button should stay disabled without class selection
    const calculateBtn = page.locator("#calculate-btn");
    await expect(calculateBtn).toBeDisabled();

    // Results should not appear
    const resultsDisplay = page.locator("#results-display");
    await expect(resultsDisplay).toBeHidden();
  });

  test("should reset form and results", async ({ page }) => {
    // Select class and fill form
    await page.locator("#class-selector").selectOption({ index: 1 });
    await page.locator("#score-earned").fill("90");
    await page.locator("#max-points").fill("100");

    // Calculate
    await page.locator("#calculate-btn").click();

    // Verify results are shown
    await expect(page.locator("#results-display")).toBeVisible();

    // Click reset
    await page.locator("#reset-btn").click();

    // Form should be cleared
    await expect(page.locator("#score-earned")).toHaveValue("");
    await expect(page.locator("#max-points")).toHaveValue("");

    // Empty state should be back
    await expect(page.locator("#empty-state")).toBeVisible();
    await expect(page.locator("#results-display")).toBeHidden();

    // Errors should be hidden
    await expect(page.locator("#calc-error")).toBeHidden();
  });

  test("should handle decimal values", async ({ page }) => {
    // Select a class
    await page.locator("#class-selector").selectOption({ index: 1 });

    // Enter decimal values
    await page.locator("#score-earned").fill("87.5");
    await page.locator("#max-points").fill("100");

    // Calculate
    await page.locator("#calculate-btn").click();

    // Results should appear
    await expect(page.locator("#results-display")).toBeVisible();

    // Should show calculated values
    const projectedPercent = await page
      .locator("#result-projected-percent")
      .textContent();
    expect(projectedPercent).toContain("%");
  });

  test("should support keyboard navigation", async ({ page }) => {
    // Select class via keyboard (use selectOption for reliability)
    const classSelector = page.locator("#class-selector");
    await classSelector.focus();
    await classSelector.selectOption({ index: 1 });

    // Tab to score input
    await page.keyboard.press("Tab");
    await page.keyboard.type("85");

    // Tab to max points
    await page.keyboard.press("Tab");
    await page.keyboard.type("100");

    // Tab to calculate button and press Enter
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");

    // Results should appear
    await expect(page.locator("#results-display")).toBeVisible();
  });

  test("should be responsive on mobile viewport", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // All sections should still be visible
    await expect(page.getByText("Grade.Impact.Dashboard")).toBeVisible();
    await expect(page.locator("#class-selector")).toBeVisible();
    await expect(page.locator("#score-earned")).toBeVisible();

    // Perform calculation
    await page.locator("#class-selector").selectOption({ index: 1 });
    await page.locator("#score-earned").fill("95");
    await page.locator("#max-points").fill("100");
    await page.locator("#calculate-btn").click();

    // Results should appear
    await expect(page.locator("#results-display")).toBeVisible();
  });

  test("should expand/collapse calculation details", async ({ page }) => {
    // Select class and calculate
    await page.locator("#class-selector").selectOption({ index: 1 });
    await page.locator("#score-earned").fill("90");
    await page.locator("#max-points").fill("100");
    await page.locator("#calculate-btn").click();

    // Find the details element
    const details = page.locator("details");
    await expect(details).toBeVisible();

    // Should have summary text
    await expect(page.getByText("Calculation Details")).toBeVisible();

    // Click to expand
    await page.getByText("Calculation Details").click();

    // Assumptions text should be visible
    await expect(page.locator("#assumptions-text")).toBeVisible();
  });

  test("should maintain state when switching classes", async ({ page }) => {
    // Select first class
    await page.locator("#class-selector").selectOption({ index: 1 });
    await page.locator("#score-earned").fill("90");
    await page.locator("#max-points").fill("100");
    await page.locator("#calculate-btn").click();

    // Get first class result
    const firstResult = await page
      .locator("#result-projected-percent")
      .textContent();

    // Switch to second class (keep same inputs)
    await page.locator("#class-selector").selectOption({ index: 2 });

    // Inputs should still be filled
    await expect(page.locator("#score-earned")).toHaveValue("90");
    await expect(page.locator("#max-points")).toHaveValue("100");

    // Calculate again
    await page.locator("#calculate-btn").click();

    // Results should be different (different class)
    const secondResult = await page
      .locator("#result-projected-percent")
      .textContent();

    // Results should update (may or may not be same value depending on classes)
    expect(secondResult).toContain("%");
  });
});
