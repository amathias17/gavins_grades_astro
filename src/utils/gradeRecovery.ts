import { getLetterGrade } from "./gradeCalculator";

export interface RecoveryClass {
  class_name: string;
  period: string;
  current_grade: number | null;
  letter_grade: string | null;
  assignments?: RecoveryAssignment[];
}

export interface RecoveryAssignment {
  name: string;
  dueDate: string | null;
  earnedPoints: number;
  totalPoints: number;
}

export interface RecoveryMissingAssignment {
  assignment_name: string;
  class_name: string;
  due_date: string;
  max_points: number | string;
}

export interface ClassRecoverySummary {
  className: string;
  period: string;
  currentGrade: number | null;
  currentLetterGrade: string | null;
  missingCount: number;
  missingPoints: number;
  projectedGrade: number | null;
  projectedLetterGrade: string | null;
  gradeDelta: number | null;
  hasEstimate: boolean;
}

const normalize = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const numeric = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const points = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

function assignmentKey(className: string, assignmentName: string, dueDate: string | null): string {
  return `${normalize(className)}|${normalize(assignmentName)}|${normalize(dueDate ?? "")}`;
}

function uniqueAssignments(className: string, assignments: RecoveryAssignment[]): RecoveryAssignment[] {
  const seen = new Set<string>();
  return assignments.filter((assignment) => {
    if (assignment.totalPoints <= 0) return false;
    const key = assignmentKey(className, assignment.name, assignment.dueDate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function calculateGradeRecovery(
  classes: RecoveryClass[],
  missingAssignments: RecoveryMissingAssignment[],
  scrapedClasses: Array<{ className: string; period: string; assignments: RecoveryAssignment[] }> = [],
): ClassRecoverySummary[] {
  const classByName = new Map(classes.map((item) => [normalize(item.class_name), item]));
  const scrapedByName = new Map(scrapedClasses.map((item) => [normalize(item.className), item]));
  const groups = new Map<string, { classInfo: RecoveryClass | null; scraped: typeof scrapedClasses[number] | null; missing: RecoveryMissingAssignment[] }>();

  for (const missing of missingAssignments) {
    const normalizedName = normalize(missing.class_name);
    const classInfo = classByName.get(normalizedName) ?? null;
    const scraped = scrapedByName.get(normalizedName) ?? null;
    if (!classInfo && !scraped) continue;
    const groupKey = `${normalizedName}|${classInfo?.period ?? scraped?.period ?? ""}`;
    const existing = groups.get(groupKey);
    if (existing) existing.missing.push(missing);
    else groups.set(groupKey, { classInfo, scraped, missing: [missing] });
  }

  return [...groups.values()]
    .map(({ classInfo, scraped, missing }) => {
      const className = classInfo?.class_name ?? scraped?.className ?? missing[0].class_name;
      const period = classInfo?.period ?? scraped?.period ?? "";
      const currentGrade = numeric(classInfo?.current_grade);
      const currentLetterGrade = classInfo?.letter_grade?.trim() || (currentGrade === null ? null : getLetterGrade(currentGrade));
      const scrapedAssignments = uniqueAssignments(className, scraped?.assignments ?? classInfo?.assignments ?? []);
      const scrapedKeys = new Set(scrapedAssignments.map((assignment) => assignmentKey(className, assignment.name, assignment.dueDate)));
      const uniqueMissing = new Map<string, number>();
      for (const item of missing) {
        const maxPoints = points(item.max_points);
        if (maxPoints === null) continue;
        const key = assignmentKey(className, item.assignment_name, item.due_date);
        if (!uniqueMissing.has(key)) uniqueMissing.set(key, maxPoints);
      }
      const missingPoints = [...uniqueMissing.values()].reduce((sum, value) => sum + value, 0);
      const currentTotalEarned = scrapedAssignments.reduce((sum, assignment) => sum + Math.max(0, assignment.earnedPoints), 0);
      const currentTotalPossible = scrapedAssignments.reduce((sum, assignment) => sum + assignment.totalPoints, 0);
      const additionalPossible = [...uniqueMissing.entries()]
        .filter(([key]) => !scrapedKeys.has(key))
        .reduce((sum, [, value]) => sum + value, 0);
      const hasEstimate = currentGrade !== null && currentTotalPossible > 0;
      const projectedGrade = hasEstimate
        ? Math.min(100, Math.round(((currentTotalEarned + missingPoints) / (currentTotalPossible + additionalPossible)) * 10000) / 100)
        : null;
      const gradeDelta = projectedGrade === null ? null : Math.round((projectedGrade - currentGrade) * 100) / 100;
      return { className, period, currentGrade, currentLetterGrade, missingCount: uniqueMissing.size, missingPoints, projectedGrade, projectedLetterGrade: projectedGrade === null ? null : getLetterGrade(projectedGrade), gradeDelta, hasEstimate };
    })
    .filter((summary) => summary.missingCount > 0)
    .sort((a, b) => b.missingPoints - a.missingPoints || a.className.localeCompare(b.className));
}
