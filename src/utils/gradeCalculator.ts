/**
 * Grade Impact Calculator Utilities
 *
 * Pure functions for calculating grade impacts based on hypothetical assignment scores.
 * All functions are side-effect free and thoroughly typed.
 */

import type { Assignment } from "../types/grades";

/**
 * Result of a grade impact calculation
 */
export interface GradeImpactResult {
  currentGrade: number;
  projectedGrade: number;
  delta: number;
  projectedLetterGrade: string;
  currentLetterGrade: string;
  isImprovement: boolean;
  isDecline: boolean;
}

/**
 * Input for calculating grade impact
 */
export interface HypotheticalAssignment {
  scoreEarned: number;
  maxPoints: number;
}

/**
 * Validation result for hypothetical assignment input
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Convert a numeric grade (0-100) to a letter grade
 */
export function getLetterGrade(numericGrade: number): string {
  if (numericGrade >= 90) return "A";
  if (numericGrade >= 80) return "B";
  if (numericGrade >= 70) return "C";
  if (numericGrade >= 60) return "D";
  return "F";
}

/**
 * Validate hypothetical assignment input
 */
export function validateHypotheticalAssignment(
  input: HypotheticalAssignment
): ValidationResult {
  const errors: string[] = [];

  if (input.scoreEarned < 0) {
    errors.push("Score earned cannot be negative");
  }

  if (input.maxPoints <= 0) {
    errors.push("Max points must be greater than zero");
  }

  if (input.scoreEarned > 10000 || input.maxPoints > 10000) {
    errors.push("Values cannot exceed 10,000 points");
  }

  if (!Number.isFinite(input.scoreEarned) || !Number.isFinite(input.maxPoints)) {
    errors.push("Values must be valid numbers");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Calculate projected grade when assignments data is available
 *
 * This uses actual assignment data to calculate a precise projected grade
 * based on total points earned vs total points possible.
 */
export function calculateWithAssignments(
  assignments: Assignment[],
  hypothetical: HypotheticalAssignment,
  currentGrade: number
): GradeImpactResult {
  // Filter to graded assignments only (skip missing/pending)
  const gradedAssignments = assignments.filter(
    (a) => a.score !== null && a.percentage !== null
  );

  if (gradedAssignments.length === 0) {
    // No graded assignments, fall back to simple calculation
    return calculateWithoutAssignments(currentGrade, hypothetical);
  }

  // Calculate current totals from actual assignments
  const currentTotalEarned = gradedAssignments.reduce(
    (sum, a) => sum + (a.score ?? 0),
    0
  );
  const currentTotalPossible = gradedAssignments.reduce(
    (sum, a) => sum + a.maxPoints,
    0
  );

  // Add hypothetical assignment
  const projectedTotalEarned = currentTotalEarned + hypothetical.scoreEarned;
  const projectedTotalPossible = currentTotalPossible + hypothetical.maxPoints;

  // Calculate projected grade (cap at 100%)
  const projectedGrade = Math.min(
    100,
    (projectedTotalEarned / projectedTotalPossible) * 100
  );

  const delta = projectedGrade - currentGrade;

  return {
    currentGrade,
    projectedGrade: Math.round(projectedGrade * 100) / 100, // Round to 2 decimals
    delta: Math.round(delta * 100) / 100,
    currentLetterGrade: getLetterGrade(currentGrade),
    projectedLetterGrade: getLetterGrade(projectedGrade),
    isImprovement: delta > 0.5, // Threshold to avoid showing insignificant changes
    isDecline: delta < -0.5,
  };
}

/**
 * Calculate projected grade when assignments data is NOT available
 *
 * This uses a simplified model that treats the current grade as if it's
 * based on 100 points, then adds the hypothetical assignment.
 */
export function calculateWithoutAssignments(
  currentGrade: number,
  hypothetical: HypotheticalAssignment
): GradeImpactResult {
  // Treat current grade as points out of 100
  // This is a simplification but works reasonably well
  const currentPoints = currentGrade;
  const currentPossible = 100;

  // Add hypothetical assignment
  const projectedTotalEarned = currentPoints + hypothetical.scoreEarned;
  const projectedTotalPossible = currentPossible + hypothetical.maxPoints;

  // Calculate projected grade (cap at 100%)
  const projectedGrade = Math.min(
    100,
    (projectedTotalEarned / projectedTotalPossible) * 100
  );

  const delta = projectedGrade - currentGrade;

  return {
    currentGrade,
    projectedGrade: Math.round(projectedGrade * 100) / 100,
    delta: Math.round(delta * 100) / 100,
    currentLetterGrade: getLetterGrade(currentGrade),
    projectedLetterGrade: getLetterGrade(projectedGrade),
    isImprovement: delta > 0.5,
    isDecline: delta < -0.5,
  };
}

/**
 * Main calculation function that automatically chooses the right strategy
 */
export function calculateGradeImpact(
  currentGrade: number,
  hypothetical: HypotheticalAssignment,
  assignments?: Assignment[]
): GradeImpactResult {
  // Validate input
  const validation = validateHypotheticalAssignment(hypothetical);
  if (!validation.isValid) {
    throw new Error(`Invalid input: ${validation.errors.join(", ")}`);
  }

  // Choose calculation strategy based on available data
  if (assignments && assignments.length > 0) {
    return calculateWithAssignments(assignments, hypothetical, currentGrade);
  } else {
    return calculateWithoutAssignments(currentGrade, hypothetical);
  }
}
