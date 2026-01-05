/**
 * Dragon Ball Collection System
 *
 * Awards one dragon ball for each class with an "A" grade.
 */

interface ClassGrade {
  letter_grade: string;
}

/**
 * Count the number of dragon balls earned based on A grades
 * @param classes Array of class objects with letter_grade property
 * @returns Number of dragon balls (count of A grades)
 */
export function countDragonBalls(classes: ClassGrade[]): number {
  return classes.filter(c => c.letter_grade === "A").length;
}

/**
 * Get the dragon ball emoji repeated for the count
 * Uses the orange circle emoji to represent dragon balls
 */
export function getDragonBallDisplay(count: number): string {
  if (count === 0) return "—";
  return "🟠".repeat(count);
}

/**
 * Get descriptive text for dragon ball count
 */
export function getDragonBallText(count: number): string {
  if (count === 0) return "No Dragon Balls";
  if (count === 7) return "All 7 Dragon Balls! 🐉";
  return `${count} / 7 Dragon Balls`;
}
