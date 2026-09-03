const DISPLAY_TIME_ZONE = "America/New_York";

function easternWallTimeToDate(year: number, month: number, day: number, hour: number, minute: number): Date {
  const roughUtc = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offsetPart = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    timeZoneName: "shortOffset",
  }).formatToParts(roughUtc).find((part) => part.type === "timeZoneName")?.value ?? "GMT-5";
  const offsetMatch = offsetPart.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  const offsetMinutes = offsetMatch
    ? (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3] ?? 0)) * (offsetMatch[1] === "+" ? 1 : -1)
    : -300;
  return new Date(roughUtc.getTime() - offsetMinutes * 60_000);
}

function parseLegacyTimestamp(value: string): Date | null {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;

  let hour = Number(match[4]);
  if (match[6].toUpperCase() === "PM" && hour !== 12) hour += 12;
  if (match[6].toUpperCase() === "AM" && hour === 12) hour = 0;
  const date = easternWallTimeToDate(Number(match[3]), Number(match[1]), Number(match[2]), hour, Number(match[5]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const legacyDate = parseLegacyTimestamp(value);
  if (legacyDate) return legacyDate;
  const isoDate = new Date(value);
  return Number.isNaN(isoDate.getTime()) ? null : isoDate;
}

export function getLatestDataUpdate(
  gradeTimestamp: string | null | undefined,
  assignmentTimestamp: string | null | undefined,
): Date | null {
  const dates = [parseTimestamp(gradeTimestamp), parseTimestamp(assignmentTimestamp)].filter(
    (date): date is Date => date !== null,
  );
  return dates.length === 0 ? null : new Date(Math.max(...dates.map((date) => date.getTime())));
}

export function formatDataUpdateTime(date: Date | null): string {
  if (!date) return "DATA UPDATE TIME UNAVAILABLE";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: DISPLAY_TIME_ZONE,
  }).format(date);
}
