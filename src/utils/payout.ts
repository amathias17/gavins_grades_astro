import type { Class } from "../types/grades";

export const PAYOUT_PER_A = 50;

export interface PayoutClass {
  className: string;
  period: string;
  grade: number | null;
  qualifies: boolean;
  payout: number;
}

export interface PayoutSummary {
  classes: PayoutClass[];
  qualifyingACount: number;
  totalPayout: number;
}

export function calculatePayout(
  classes: Pick<Class, "class_name" | "period" | "current_grade">[],
): PayoutSummary {
  const payoutClasses = classes.map((classInfo) => {
    const grade = Number.isFinite(classInfo.current_grade)
      ? classInfo.current_grade
      : null;
    const qualifies = grade !== null && grade >= 90;

    return {
      className: classInfo.class_name,
      period: classInfo.period,
      grade,
      qualifies,
      payout: qualifies ? PAYOUT_PER_A : 0,
    };
  });

  const qualifyingACount = payoutClasses.filter((classInfo) => classInfo.qualifies).length;

  return {
    classes: payoutClasses,
    qualifyingACount,
    totalPayout: qualifyingACount * PAYOUT_PER_A,
  };
}
