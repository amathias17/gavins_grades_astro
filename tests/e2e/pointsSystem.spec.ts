import { expect, test } from "@playwright/test";
import { calculatePoints } from "../../src/utils/points";
import type { MarkingPeriod } from "../../src/utils/schoolCalendar";
import { applyProtectedProgress, getProtectedTotal } from "../../src/utils/pointsProgress";
import { formatDataUpdateTime, getLatestDataUpdate } from "../../src/utils/dataFreshness";
import { getBadgeStates, getCurrentBadge } from "../../src/utils/badges";

const period: MarkingPeriod = { number: 1, start: "2026-08-26", end: "2026-10-30" };

test.describe("positive marking-period points", () => {
  test("maps protected quest points to the capped badge progression", () => {
    expect(getCurrentBadge(0).characterName).toBe("Goku");
    expect(getCurrentBadge(999).characterName).toBe("Vegeta");
    expect(getCurrentBadge(1000).characterName).toBe("Gohan");
    expect(getCurrentBadge(5000).characterName).toBe("Gogeta");
    expect(getBadgeStates(250).filter((badge) => badge.unlocked).map((badge) => badge.characterName)).toEqual(["Goku", "Krillin", "Piccolo"]);
    expect(getBadgeStates(5000).at(-1)?.isFinal).toBe(true);
  });

  test("selects and formats the newest data source timestamp", () => {
    const latest = getLatestDataUpdate("09/03/2026, 11:48 AM", "2026-09-03T15:48:10.742Z");
    expect(latest?.toISOString()).toBe("2026-09-03T15:48:10.742Z");
    expect(formatDataUpdateTime(latest)).toContain("Sep 3, 2026");
    expect(formatDataUpdateTime(latest)).toMatch(/11:48\s*AM/);
    expect(formatDataUpdateTime(getLatestDataUpdate("not a date", null))).toBe("DATA UPDATE TIME UNAVAILABLE");
    const gradeOnly = getLatestDataUpdate("09/03/2026, 12:48 PM", "2026-09-03T16:00:00.000Z");
    expect(gradeOnly?.toISOString()).toBe("2026-09-03T16:48:00.000Z");
  });

  test("protects quest progress while keeping the current snapshot factual", () => {
    const raw = calculatePoints([], [], period);
    const ledger = { schoolYear: "2026-2027", periods: { "1": { maxTotalPoints: 169, updatedAt: "2026-09-02T00:00:00.000Z" } } };
    expect(getProtectedTotal(20, ledger, "2026-2027", 1)).toBe(169);
    expect(getProtectedTotal(200, ledger, "2026-2027", 1)).toBe(200);
    expect(getProtectedTotal(20, ledger, "2026-2027", 2)).toBe(20);
    expect(getProtectedTotal(200, ledger, "2025-2026", 1)).toBe(200);
    expect(applyProtectedProgress(raw, ledger, "2026-2027").totalPoints).toBe(169);
    expect(applyProtectedProgress(raw, ledger, "2026-2027").assignmentPoints).toBe(0);
  });

  test("awards actual points, full-credit bonuses, and A-grade bonuses", () => {
    const result = calculatePoints(
      [{ class_name: "English", period: "1", current_grade: 95 }],
      [{
        className: "English",
        period: "1",
        assignments: [
          { name: "Essay", dueDate: "08/28/2026", earnedPoints: 9, totalPoints: 10, graded: true },
          { name: "Quiz", dueDate: "09/01/2026", earnedPoints: 10, totalPoints: 10, graded: true },
        ],
      }],
      period,
    );

    expect(result.assignmentPoints).toBe(19);
    expect(result.fullCreditBonuses).toBe(2);
    expect(result.classGradeBonuses).toBe(10);
    expect(result.totalPoints).toBe(31);
    expect(result.availablePoints).toBe(20);
    expect(result.readyToEarnPoints).toBe(0);
    expect(result.awaitingGradePoints).toBe(0);
    expect(result.completionPercent).toBe(95);
    expect(result.assignments).toEqual([
      { className: "English", assignmentName: "Essay", dueDate: "08/28/2026", earnedPoints: 9, possiblePoints: 10, status: "completed" },
      { className: "English", assignmentName: "Quiz", dueDate: "09/01/2026", earnedPoints: 10, possiblePoints: 10, status: "completed" },
    ]);
  });

  test("shows incomplete work as an opportunity without subtracting points", () => {
    const result = calculatePoints(
      [{ class_name: "Math", period: "2", current_grade: 0 }],
      [{
        className: "Math",
        period: "2",
        assignments: [{ name: "Practice", dueDate: "09/02/2026", earnedPoints: 0, totalPoints: 20, graded: false }],
      }],
      period,
    );

    expect(result.totalPoints).toBe(0);
    expect(result.availablePoints).toBe(20);
    expect(result.readyToEarnPoints).toBe(0);
    expect(result.awaitingGradePoints).toBe(20);
    expect(result.opportunities).toEqual([{
      className: "Math",
      assignmentName: "Practice",
      dueDate: "09/02/2026",
      availablePoints: 20,
      opportunityType: "not-graded",
    }]);
    expect(result.assignments[0]).toMatchObject({ assignmentName: "Practice", earnedPoints: 0, possiblePoints: 20, status: "not-graded" });
  });

  test("reconciles a missing feed item over an incorrectly graded scraper row", () => {
    const result = calculatePoints(
      [{ class_name: "ENVIRON SCIENCE 1", period: "1", current_grade: 88 }],
      [{ className: "ENVIRON SCIENCE 1", period: "1", assignments: [{ name: "Signed Syllabus", dueDate: "08/31/2026", earnedPoints: 0, totalPoints: 5, graded: true }] }],
      period,
      [{ assignment_name: "Signed Syllabus", class_name: "ENVIRON SCIENCE    1", due_date: "08/31/2026", max_points: "5" }],
    );

    expect(result.assignments).toEqual([{ className: "ENVIRON SCIENCE 1", assignmentName: "Signed Syllabus", dueDate: "08/31/2026", earnedPoints: 0, possiblePoints: 5, status: "missing" }]);
    expect(result.opportunities).toEqual([{ className: "ENVIRON SCIENCE 1", assignmentName: "Signed Syllabus", dueDate: "08/31/2026", availablePoints: 5, opportunityType: "missing" }]);
    expect(result.fullCreditBonuses).toBe(0);
    expect(result.readyToEarnPoints).toBe(5);
    expect(result.awaitingGradePoints).toBe(0);
  });

  test("adds unmatched current-period missing items once and ignores invalid or out-of-period records", () => {
    const result = calculatePoints(
      [{ class_name: "Math", period: "2", current_grade: null }],
      [],
      period,
      [
        { assignment_name: "Practice", class_name: "Math", due_date: "09/02/2026", max_points: "20" },
        { assignment_name: "Invalid", class_name: "Math", due_date: "not-a-date", max_points: "10" },
        { assignment_name: "Later", class_name: "Math", due_date: "11/01/2026", max_points: "10" },
      ],
    );

    expect(result.availablePoints).toBe(20);
    expect(result.opportunities).toHaveLength(1);
    expect(result.readyToEarnPoints).toBe(20);
    expect(result.awaitingGradePoints).toBe(0);
    expect(result.assignments[0]).toMatchObject({ assignmentName: "Practice", status: "missing" });
  });

  test("prioritizes confirmed missing opportunities over not-graded work", () => {
    const result = calculatePoints(
      [{ class_name: "Math", period: "2", current_grade: null }],
      [{ className: "Math", period: "2", assignments: [{ name: "Awaiting Grade", dueDate: "09/03/2026", earnedPoints: 0, totalPoints: 10, graded: false }] }],
      period,
      [
        { assignment_name: "Confirmed Missing", class_name: "Math", due_date: "09/02/2026", max_points: "20" },
        { assignment_name: "Second Missing", class_name: "Math", due_date: "09/04/2026", max_points: "5" },
      ],
    );

    expect(result.opportunities.map((opportunity) => opportunity.opportunityType)).toEqual(["missing", "missing", "not-graded"]);
    expect(result.readyToEarnPoints).toBe(25);
    expect(result.awaitingGradePoints).toBe(10);
  });

  test("filters invalid and out-of-period assignments and deduplicates rows", () => {
    const result = calculatePoints(
      [{ class_name: "Science", period: "3", current_grade: null }],
      [{
        className: "Science",
        period: "3",
        assignments: [
          { name: "Lab", dueDate: "08/30/2026", earnedPoints: 5, totalPoints: 5, graded: true },
          { name: "Lab", dueDate: "08/30/2026", earnedPoints: 5, totalPoints: 5, graded: true },
          { name: "Future", dueDate: "11/01/2026", earnedPoints: 10, totalPoints: 10, graded: true },
          { name: "Unknown", dueDate: "N/A", earnedPoints: 10, totalPoints: 10, graded: true },
        ],
      }],
      period,
    );

    expect(result.assignmentPoints).toBe(5);
    expect(result.fullCreditBonuses).toBe(2);
    expect(result.availablePoints).toBe(5);
  });

  test("uses a null period as an honest empty state", () => {
    const result = calculatePoints([], [], null);

    expect(result.totalPoints).toBe(0);
    expect(result.nextMilestone).toBe(100);
    expect(result.pointsToNextMilestone).toBe(100);
    expect(result.opportunities).toHaveLength(0);
  });
});
