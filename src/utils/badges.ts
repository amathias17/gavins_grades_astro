import badgeData from "../data/badges.json" with { type: "json" };

export interface BadgeDefinition {
  id: string;
  characterName: string;
  unlockPoints: number;
  level: number;
  imagePath: string;
  isFinal: boolean;
}

export interface BadgeState extends BadgeDefinition {
  unlocked: boolean;
  isCurrent: boolean;
}

export const badges: BadgeDefinition[] = badgeData;

export function getBadgeStates(protectedTotal: number): BadgeState[] {
  const currentIndex = badges.reduce(
    (index, badge, badgeIndex) => (protectedTotal >= badge.unlockPoints ? badgeIndex : index),
    0,
  );

  return badges.map((badge, index) => ({
    ...badge,
    unlocked: index <= currentIndex,
    isCurrent: index === currentIndex,
  }));
}

export function getCurrentBadge(protectedTotal: number): BadgeState {
  return getBadgeStates(protectedTotal).find((badge) => badge.isCurrent) ?? {
    ...badges[0],
    unlocked: true,
    isCurrent: true,
  };
}
