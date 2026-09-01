import { expect, test } from "@playwright/test";
import { calculatePoints } from "../../src/utils/points";
import type { MarkingPeriod } from "../../src/utils/schoolCalendar";

const period: MarkingPeriod = { number: 1, start: "2026-08-26", end: "2026-10-30" };

test.describe("positive marking-period points", () => {
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
    expect(result.completionPercent).toBe(95);
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
    expect(result.opportunities).toEqual([{
      className: "Math",
      assignmentName: "Practice",
      dueDate: "09/02/2026",
      availablePoints: 20,
    }]);
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
