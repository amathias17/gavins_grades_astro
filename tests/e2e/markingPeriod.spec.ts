import { expect, test } from "@playwright/test";
import { countSchoolDays, getMarkingPeriodStatus, getSchoolDayReminder, markingPeriods, specialDays, testingWindows } from "../../src/utils/schoolCalendar";

test.describe("school calendar marking periods", () => {
  test("keeps the published calendar data complete", () => {
    expect(markingPeriods).toHaveLength(4);
    expect(specialDays.length).toBeGreaterThan(0);
    expect(testingWindows).toHaveLength(4);
  });

  test("counts weekdays while excluding supplied closures", () => {
    expect(countSchoolDays("2026-08-26", "2026-08-31")).toBe(4);
  });

  test("reports the final day as ending today", () => {
    const status = getMarkingPeriodStatus("2026-10-30");

    expect(status.status).toBe("active");
    expect(status.period?.number).toBe(1);
    expect(status.label).toBe("ENDS TODAY");
    expect(status.schoolDaysRemaining).toBe(1);
  });

  test("selects the next period after a marking-period boundary", () => {
    const status = getMarkingPeriodStatus("2026-10-31");

    expect(status.period?.number).toBe(2);
    expect(status.schoolDaysRemaining).toBeGreaterThan(0);
  });

  test("recognizes pre-school and completed-year states", () => {
    expect(getMarkingPeriodStatus("2026-08-25").status).toBe("before-school");
    expect(getMarkingPeriodStatus("2027-06-05").status).toBe("completed");
  });

  test("gives school-day-aware reminders", () => {
    expect(getSchoolDayReminder("2026-08-25").label).toBe("SCHOOL STARTS TOMORROW");
    expect(getSchoolDayReminder("2026-09-25").label).toBe("NO SCHOOL TODAY");
    expect(getSchoolDayReminder("2026-12-03").label).toBe("SPECIAL SCHEDULE TOMORROW");
    expect(getSchoolDayReminder("2026-08-31").isCheckpoint).toBe(true);
    expect(getSchoolDayReminder("2026-09-25").isCheckpoint).toBeUndefined();
  });

  test("renders the live marking-period card on the homepage", async ({ page }) => {
    await page.goto("/");

    const card = page.locator("[data-marking-period-card]");
    await expect(card).toBeVisible();
    await expect(card.locator(".marking-period-signal")).toHaveCount(0);
    await expect(card.locator("#marking-period-heading")).toContainText(/MARKING PERIOD|SCHOOL YEAR/);
    await expect(card.locator("[data-marking-period-detail]")).toContainText(/2026|2027/);
  });
});
