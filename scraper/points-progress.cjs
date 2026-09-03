const fs = require('fs').promises;
const path = require('path');

const ledgerPath = path.join(__dirname, '../src/data/points_progress.json');
const calendar = require('../src/data/school_calendar.json');

function normalize(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function dateValue(value) {
  const match = String(value || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2]));
}

function isInPeriod(value, period) {
  const date = dateValue(value);
  return date !== null && date >= Date.parse(`${period.start}T00:00:00Z`) && date <= Date.parse(`${period.end}T00:00:00Z`);
}

function numeric(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function currentPeriod(today = new Date()) {
  const key = today.toISOString().slice(0, 10);
  return calendar.markingPeriods.find((period) => key >= period.start && key <= period.end) || null;
}

function calculatePersistentPoints(classes, scrapedClasses, missingAssignments, period) {
  if (!period) return 0;
  const missing = new Set((missingAssignments || []).map((item) => `${normalize(item.class_name)}|${normalize(item.assignment_name)}|${item.due_date}`));
  const seen = new Set();
  let assignmentPoints = 0;
  let fullCreditCount = 0;
  for (const scrapedClass of scrapedClasses || []) {
    for (const assignment of scrapedClass.assignments || []) {
      const total = numeric(assignment.totalPoints);
      if (total === null || total <= 0 || !isInPeriod(assignment.dueDate, period)) continue;
      const key = `${normalize(scrapedClass.className)}|${normalize(assignment.name)}|${assignment.dueDate || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const isMissing = missing.has(key);
      const weight = numeric(assignment.weight);
      const multiplier = weight !== null && weight > 0 ? weight : 1;
      const earned = isMissing ? 0 : Math.min(Math.max(numeric(assignment.earnedPoints) || 0, 0), total);
      assignmentPoints += earned * multiplier;
      if (!isMissing && assignment.graded && (numeric(assignment.earnedPoints) || 0) >= total) fullCreditCount += 1;
    }
  }
  return assignmentPoints + fullCreditCount * 2;
}

function calculateAGradeBonus(classes) {
  return (classes || []).filter((item) => (numeric(item.current_grade) || 0) >= 90).length * 10;
}

function calculateRawTotal(classes, scrapedClasses, missingAssignments, period) {
  if (!period) return 0;
  return calculatePersistentPoints(classes, scrapedClasses, missingAssignments, period) + calculateAGradeBonus(classes);
}

async function updatePointsProgress({ classes, scrapedClasses, missingAssignments, now = new Date() }) {
  const period = currentPeriod(now);
  if (!period) return { changed: false, rawTotal: 0, protectedTotal: null };
  const previous = await fs.readFile(ledgerPath, 'utf8').then(JSON.parse).catch(() => ({ schoolYear: calendar.schoolYear, periods: {} }));
  const persistentPoints = calculatePersistentPoints(classes, scrapedClasses, missingAssignments, period);
  const aGradeBonus = calculateAGradeBonus(classes);
  const rawTotal = persistentPoints + aGradeBonus;
  const periodKey = String(period.number);
  const previousPeriod = previous.schoolYear === calendar.schoolYear ? previous.periods?.[periodKey] : null;
  const previousMax = numeric(previousPeriod?.maxPersistentPoints) ?? numeric(previousPeriod?.maxTotalPoints) ?? 0;
  const protectedPersistentPoints = Math.max(previousMax, persistentPoints);
  const protectedTotal = protectedPersistentPoints + aGradeBonus;
  if (previous.schoolYear === calendar.schoolYear && previousPeriod && protectedPersistentPoints === previousMax) {
    return { changed: false, rawTotal, protectedTotal };
  }
  const next = previous.schoolYear === calendar.schoolYear ? previous : { schoolYear: calendar.schoolYear, periods: {} };
  next.periods = { ...(next.periods || {}), [periodKey]: { maxPersistentPoints: protectedPersistentPoints, updatedAt: now.toISOString() } };
  await fs.writeFile(ledgerPath, JSON.stringify(next, null, 2));
  return { changed: true, rawTotal, protectedTotal };
}

module.exports = { calculatePersistentPoints, calculateRawTotal, currentPeriod, updatePointsProgress };
