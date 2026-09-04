export interface RoutableClass {
  class_name: string;
  period: string;
  class_id?: string | null;
}

export function normalizeClassName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function classSlug(value: string): string {
  return normalizeClassName(value).replace(/\s+/g, "-");
}

export function getClassRouteKey(classInfo: RoutableClass, allClasses: RoutableClass[]): string {
  const classId = classInfo.class_id?.trim();
  if (classId) return classId;

  const period = (classInfo.period ?? "").trim();
  const samePeriodCount = allClasses.filter((candidate) => (candidate.period ?? "").trim() === period).length;
  return samePeriodCount === 1
    ? period
    : `${period}-${classSlug(classInfo.class_name)}`;
}
