export function formatQuestPointDisplay(points: number): string {
  const roundedPoints = Number.isFinite(points) ? Math.round(points) : 0;
  return roundedPoints.toLocaleString("en-US");
}
