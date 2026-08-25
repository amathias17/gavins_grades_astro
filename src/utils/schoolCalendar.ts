export type CalendarStatus = "before-school" | "active" | "after-period" | "completed";

export interface MarkingPeriod {
  number: number;
  start: string;
  end: string;
}

export interface SpecialDay {
  date: string;
  label: string;
  kind: "closure" | "modified";
}

export interface MarkingPeriodStatus {
  status: CalendarStatus;
  period: MarkingPeriod | null;
  nextPeriod: MarkingPeriod | null;
  schoolDaysRemaining: number;
  schoolDaysTotal: number;
  label: string;
  detail: string;
  progressPercent: number;
}

export const markingPeriods: MarkingPeriod[] = [
  { number: 1, start: "2026-08-26", end: "2026-10-30" },
  { number: 2, start: "2026-10-31", end: "2027-01-21" },
  { number: 3, start: "2027-01-22", end: "2027-03-31" },
  { number: 4, start: "2027-04-01", end: "2027-06-04" },
];

export const specialDays: SpecialDay[] = [
  { date: "2026-08-21", label: "Teacher inservice", kind: "closure" },
  { date: "2026-08-24", label: "Teacher inservice", kind: "closure" },
  { date: "2026-08-25", label: "Teacher inservice", kind: "closure" },
  { date: "2026-09-25", label: "Teacher inservice", kind: "closure" },
  { date: "2026-11-03", label: "Teacher inservice", kind: "closure" },
  { date: "2026-11-25", label: "Teacher inservice", kind: "closure" },
  { date: "2026-12-24", label: "Teacher inservice", kind: "closure" },
  { date: "2027-02-19", label: "Teacher inservice", kind: "closure" },
  { date: "2027-05-18", label: "Teacher inservice", kind: "closure" },
  { date: "2027-06-07", label: "Teacher inservice", kind: "closure" },
  { date: "2026-12-04", label: "Morning students; afternoon staff only", kind: "modified" },
];

const closureDates = new Set(
  specialDays.filter((day) => day.kind === "closure").map((day) => day.date),
);

function toUtcDate(value: string | Date): Date {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function isSchoolDay(date: Date): boolean {
  const weekday = date.getUTCDay();
  return weekday !== 0 && weekday !== 6 && !closureDates.has(toDateKey(date));
}

export function countSchoolDays(start: string | Date, end: string | Date): number {
  let current = toUtcDate(start);
  const final = toUtcDate(end);
  let count = 0;

  while (current <= final) {
    if (isSchoolDay(current)) count += 1;
    current = addDays(current, 1);
  }

  return count;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(toUtcDate(value));
}

export function getMarkingPeriodStatus(today: string | Date = new Date()): MarkingPeriodStatus {
  const date = toUtcDate(today);
  const dateKey = toDateKey(date);
  const firstPeriod = markingPeriods[0];
  const lastPeriod = markingPeriods[markingPeriods.length - 1];

  if (dateKey < firstPeriod.start) {
    return {
      status: "before-school",
      period: null,
      nextPeriod: firstPeriod,
      schoolDaysRemaining: 0,
      schoolDaysTotal: 0,
      label: "SCHOOL YEAR LOADING",
      detail: `Marking Period 1 starts ${formatDate(firstPeriod.start)}`,
      progressPercent: 0,
    };
  }

  if (dateKey > lastPeriod.end) {
    return {
      status: "completed",
      period: null,
      nextPeriod: null,
      schoolDaysRemaining: 0,
      schoolDaysTotal: 0,
      label: "SCHOOL YEAR COMPLETE",
      detail: `Marking Period 4 ended ${formatDate(lastPeriod.end)}`,
      progressPercent: 100,
    };
  }

  const period = markingPeriods.find((candidate) => dateKey >= candidate.start && dateKey <= candidate.end) ?? firstPeriod;
  const total = countSchoolDays(period.start, period.end);
  const remaining = countSchoolDays(date, period.end);
  const elapsed = Math.max(0, total - remaining);
  const isLastSchoolDay = dateKey === period.end;

  return {
    status: "active",
    period,
    nextPeriod: markingPeriods.find((candidate) => candidate.number === period.number + 1) ?? null,
    schoolDaysRemaining: remaining,
    schoolDaysTotal: total,
    label: isLastSchoolDay ? "ENDS TODAY" : `${remaining} SCHOOL DAYS LEFT`,
    detail: `Marking Period ${period.number} ends ${formatDate(period.end)}`,
    progressPercent: Math.min(100, Math.round((elapsed / total) * 100)),
  };
}
