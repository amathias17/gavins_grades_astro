import badgeData from "../data/badges.json" with { type: "json" };
import { fetchBadgeCharacterData, type DragonBallFetch } from "./dragonBallApi";

export interface BadgeDefinition {
  id: string;
  characterName: string;
  apiCharacterId: number;
  apiTransformationId?: number;
  unlockPoints: number;
  level: number;
  imagePath?: string;
  isFinal: boolean;
}

export interface BadgeState extends BadgeDefinition {
  unlocked: boolean;
  isCurrent: boolean;
  affiliation?: string;
  baseKi?: string;
  totalKi?: string;
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

export async function getBadgeStatesWithApiArtwork(protectedTotal: number, fetcher?: DragonBallFetch): Promise<BadgeState[]> {
  const states = getBadgeStates(protectedTotal);
  const characterData = await fetchBadgeCharacterData(states.map((badge) => ({
    characterId: badge.apiCharacterId,
    transformationId: badge.apiTransformationId,
  })), fetcher);

  return states.map((badge) => ({
    ...badge,
    imagePath: characterData.get(badge.apiTransformationId ?? badge.apiCharacterId)?.image,
    affiliation: characterData.get(badge.apiTransformationId ?? badge.apiCharacterId)?.affiliation,
    baseKi: characterData.get(badge.apiTransformationId ?? badge.apiCharacterId)?.ki,
    totalKi: characterData.get(badge.apiTransformationId ?? badge.apiCharacterId)?.maxKi,
  }));
}
