import fs from "node:fs/promises";
import path from "node:path";
import gradesData from "../data/grades.json";
import missingAssignmentsData from "../data/missing_assignments.json";
import pointsProgressData from "../data/points_progress.json";
import { calculatePoints, type MissingPointAssignment, type ScrapedPointClass } from "./points";
import { applyProtectedProgress } from "./pointsProgress";
import { getMarkingPeriodStatus, schoolYear } from "./schoolCalendar";

export async function getCurrentQuestPoints() {
  let scrapedClasses: ScrapedPointClass[] = [];

  try {
    const raw = await fs.readFile(path.resolve("scraper", "detailed-grades.json"), "utf8");
    scrapedClasses = (JSON.parse(raw) as { classes?: ScrapedPointClass[] }).classes ?? [];
  } catch {
    scrapedClasses = [];
  }

  const periodStatus = getMarkingPeriodStatus();
  const missingAssignments = (missingAssignmentsData.missing_assignments ?? []) as MissingPointAssignment[];
  const rawPoints = calculatePoints(gradesData.classes, scrapedClasses, periodStatus.period, missingAssignments);
  return applyProtectedProgress(rawPoints, pointsProgressData, schoolYear);
}
