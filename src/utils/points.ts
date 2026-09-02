import type { MarkingPeriod } from "./schoolCalendar";
import type { Class } from "../types/grades";

export const FULL_CREDIT_BONUS = 2;
export const A_GRADE_BONUS = 10;
export const MILESTONES = [100, 250, 500, 1000] as const;

export interface ScrapedPointAssignment {
  name: string;
  dueDate: string | null;
  earnedPoints: number;
  totalPoints: number;
  weight?: number | null;
  graded: boolean;
}

export interface ScrapedPointClass {
  className: string;
  period: string;
  assignments: ScrapedPointAssignment[];
}

export interface PointOpportunity {
  className: string;
  assignmentName: string;
  dueDate: string;
  availablePoints: number;
  opportunityType: "missing" | "not-graded";
}

export interface MissingPointAssignment {
  assignment_name: string;
  class_name: string;
  due_date: string;
  max_points: number | string;
}

export interface PointAssignment {
  className: string;
  assignmentName: string;
  dueDate: string;
  earnedPoints: number;
  possiblePoints: number;
  status: "completed" | "missing" | "not-graded";
}

export interface PointsSummary {
  period: MarkingPeriod | null;
  earnedPoints: number;
  availablePoints: number;
  completionPercent: number;
  assignmentPoints: number;
  fullCreditBonuses: number;
  classGradeBonuses: number;
  totalPoints: number;
  level: number;
  nextMilestone: number | null;
  pointsToNextMilestone: number;
  opportunities: PointOpportunity[];
  assignments: PointAssignment[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

function isInPeriod(value: string | null, period: MarkingPeriod): boolean {
  const date = parseDate(value);
  if (!date) return false;
  return value !== null && value.length > 0 && date >= new Date(`${period.start}T00:00:00Z`) && date <= new Date(`${period.end}T00:00:00Z`);
}

function numeric(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function dateKey(value: string | null): string {
  const date = parseDate(value);
  return date ? date.toISOString().slice(0, 10) : normalize(value ?? "");
}

function assignmentKey(className: string, assignmentName: string, dueDate: string | null): string {
  return `${normalize(className)}|${normalize(assignmentName)}|${dateKey(dueDate)}`;
}

function milestoneFor(total: number): { level: number; nextMilestone: number | null; pointsToNextMilestone: number } {
  let level = 0;
  for (const milestone of MILESTONES) {
    if (total >= milestone) level += 1;
  }

  const nextMilestone = total < MILESTONES[MILESTONES.length - 1]
    ? MILESTONES.find((milestone) => total < milestone) ?? null
    : Math.floor(total / 500 + 1) * 500;

  return {
    level,
    nextMilestone,
    pointsToNextMilestone: nextMilestone === null ? 0 : Math.max(0, nextMilestone - total),
  };
}

export function calculatePoints(
  classes: Pick<Class, "class_name" | "period" | "current_grade">[],
  scrapedClasses: ScrapedPointClass[],
  period: MarkingPeriod | null,
  missingAssignments: MissingPointAssignment[] = [],
): PointsSummary {
  const opportunities: PointOpportunity[] = [];
  const assignments: PointAssignment[] = [];
  const seen = new Set<string>();
  let assignmentPoints = 0;
  let availablePoints = 0;
  let fullCreditCount = 0;
  const missingByKey = new Map<string, MissingPointAssignment>();
  for (const missing of missingAssignments) {
    const key = assignmentKey(missing.class_name, missing.assignment_name, missing.due_date);
    if (!missingByKey.has(key)) missingByKey.set(key, missing);
  }
  const matchedMissing = new Set<string>();

  if (period) {
    for (const scrapedClass of scrapedClasses) {
      for (const assignment of scrapedClass.assignments ?? []) {
        const total = numeric(assignment.totalPoints);
        if (total === null || total <= 0 || !isInPeriod(assignment.dueDate, period)) continue;

        const key = assignmentKey(scrapedClass.className, assignment.name, assignment.dueDate);
        if (seen.has(key)) continue;
        seen.add(key);

        const missing = missingByKey.get(key);
        if (missing) matchedMissing.add(key);
        const weight = numeric(assignment.weight);
        const multiplier = weight !== null && weight > 0 ? weight : 1;
        const missingTotal = missing ? numeric(Number(missing.max_points)) : null;
        const possible = (missingTotal !== null && missingTotal > 0 ? missingTotal : total) * multiplier;
        const earned = missing
          ? 0
          : Math.min(Math.max(numeric(assignment.earnedPoints) ?? 0, 0), total) * multiplier;
        availablePoints += possible;
        assignmentPoints += earned;

        assignments.push({
          className: scrapedClass.className,
          assignmentName: assignment.name,
          dueDate: assignment.dueDate ?? "",
          earnedPoints: earned,
          possiblePoints: possible,
          status: missing ? "missing" : assignment.graded ? "completed" : "not-graded",
        });

        if (!missing && assignment.graded && (numeric(assignment.earnedPoints) ?? 0) >= total) {
          fullCreditCount += 1;
        }

        if (missing || !assignment.graded) {
          opportunities.push({
            className: scrapedClass.className,
            assignmentName: assignment.name,
            dueDate: assignment.dueDate ?? "",
            availablePoints: possible,
            opportunityType: missing ? "missing" : "not-graded",
          });
        }
      }
    }

    for (const missing of missingAssignments) {
      const key = assignmentKey(missing.class_name, missing.assignment_name, missing.due_date);
      if (matchedMissing.has(key) || seen.has(key) || !isInPeriod(missing.due_date, period)) continue;

      const maxPoints = numeric(Number(missing.max_points));
      if (maxPoints === null || maxPoints <= 0) continue;

      const scrapedClass = scrapedClasses.find((candidate) => normalize(candidate.className) === normalize(missing.class_name));
      const classInfo = classes.find((candidate) => normalize(candidate.class_name) === normalize(missing.class_name));
      const className = scrapedClass?.className ?? classInfo?.class_name;
      if (!className) continue;

      seen.add(key);
      availablePoints += maxPoints;
      assignments.push({ className, assignmentName: missing.assignment_name, dueDate: missing.due_date, earnedPoints: 0, possiblePoints: maxPoints, status: "missing" });
      opportunities.push({ className, assignmentName: missing.assignment_name, dueDate: missing.due_date, availablePoints: maxPoints, opportunityType: "missing" });
    }
  }

  opportunities.sort((left, right) => Number(right.opportunityType === "missing") - Number(left.opportunityType === "missing"));

  const classGradeBonuses = classes.filter((classInfo) => {
    const grade = numeric(classInfo.current_grade);
    return grade !== null && grade >= 90;
  }).length * A_GRADE_BONUS;
  const fullCreditBonuses = fullCreditCount * FULL_CREDIT_BONUS;
  const totalPoints = assignmentPoints + fullCreditBonuses + classGradeBonuses;
  const milestone = milestoneFor(totalPoints);

  return {
    period,
    earnedPoints: totalPoints,
    availablePoints,
    completionPercent: availablePoints === 0 ? 0 : Math.round((assignmentPoints / availablePoints) * 10000) / 100,
    assignmentPoints,
    fullCreditBonuses,
    classGradeBonuses,
    totalPoints,
    ...milestone,
    opportunities,
    assignments,
  };
}
