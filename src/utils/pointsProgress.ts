import type { PointsSummary } from "./points";
import { getBadgeMilestoneProgress } from "./badgeMilestones";

export interface PointsProgressPeriod {
  maxPersistentPoints: number;
  maxTotalPoints?: number;
  updatedAt: string;
}

export interface PointsProgressLedger {
  schoolYear: string;
  periods: Record<string, PointsProgressPeriod>;
}

export function getProtectedPersistentPoints(
  rawPersistentPoints: number,
  ledger: PointsProgressLedger | null | undefined,
  currentSchoolYear: string,
  periodNumber: number | null,
): number {
  if (periodNumber === null || !Number.isFinite(rawPersistentPoints)) return Math.max(0, rawPersistentPoints);
  const previous = ledger?.schoolYear === currentSchoolYear
    ? ledger.periods[String(periodNumber)]?.maxPersistentPoints ?? ledger.periods[String(periodNumber)]?.maxTotalPoints ?? 0
    : 0;
  return Math.max(0, previous, rawPersistentPoints);
}

export function applyProtectedProgress(
  points: PointsSummary,
  ledger: PointsProgressLedger | null | undefined,
  currentSchoolYear: string,
): PointsSummary {
  const protectedPersistentPoints = getProtectedPersistentPoints(
    points.persistentPoints,
    ledger,
    currentSchoolYear,
    points.period?.number ?? null,
  );
  const protectedTotal = protectedPersistentPoints + points.classGradeBonuses;
  const milestone = getBadgeMilestoneProgress(protectedTotal);

  return {
    ...points,
    earnedPoints: protectedTotal,
    totalPoints: protectedTotal,
    ...milestone,
  };
}
