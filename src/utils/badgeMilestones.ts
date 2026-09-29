import badgeData from "../data/badges.json" with { type: "json" };

export interface BadgeMilestoneProgress {
  level: number;
  previousMilestone: number;
  nextMilestone: number | null;
  nextBadgeName: string | null;
  pointsToNextMilestone: number;
  milestoneProgressPercent: number;
}

export function getBadgeMilestoneProgress(total: number): BadgeMilestoneProgress {
  const points = Number.isFinite(total) ? Math.max(0, total) : 0;
  const nextBadgeIndex = badgeData.findIndex((badge) => points < badge.unlockPoints);
  const nextBadge = nextBadgeIndex < 0 ? null : badgeData[nextBadgeIndex];
  const previousBadge = nextBadgeIndex === 0
    ? badgeData[0]
    : badgeData[(nextBadgeIndex < 0 ? badgeData.length : nextBadgeIndex) - 1];
  const previousMilestone = previousBadge.unlockPoints;
  const nextMilestone = nextBadge?.unlockPoints ?? null;
  const milestoneProgressPercent = nextBadge
    ? Math.min(100, Math.max(0, Math.round(((points - previousMilestone) / (nextBadge.unlockPoints - previousMilestone)) * 100)))
    : 100;

  return {
    level: (nextBadge?.level ?? badgeData[badgeData.length - 1].level) - 1,
    previousMilestone,
    nextMilestone,
    nextBadgeName: nextBadge?.characterName ?? null,
    pointsToNextMilestone: nextMilestone === null ? 0 : Math.max(0, nextMilestone - points),
    milestoneProgressPercent,
  };
}
