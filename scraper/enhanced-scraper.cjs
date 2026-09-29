/**
 * Enhanced Skyward scraper that extracts detailed assignment information
 * including earned points and total possible points by clicking into each assignment.
 *
 * Usage:
 *   SKYWARD_USERNAME=... SKYWARD_PASSWORD=... node scraper/enhanced-scraper.cjs
 */

const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const cheerio = require('cheerio');
const { updatePointsProgress } = require('./points-progress.cjs');

const CACHE_FILENAME = 'detailed-grades-cache.json';

function normalizeDueDate(raw) {
  if (!raw) return null;
  const value = raw.trim();
  const dateMatch = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (dateMatch) {
    const month = dateMatch[1].padStart(2, '0');
    const day = dateMatch[2].padStart(2, '0');
    let year = dateMatch[3];
    if (year.length === 2) {
      year = `20${year}`;
    }
    return `${month}/${day}/${year}`;
  }

  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) {
    const date = new Date(parsed);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}/${day}/${date.getFullYear()}`;
  }

  return null;
}

function getAssignmentScoreHint(rawText) {
  const text = String(rawText || '');
  const match = text.match(/(\*|\d+(?:\.\d+)?)\s*(?:\/|out\s*of)\s*(\d+(?:\.\d+)?)(?!\s*\/\s*\d{2,4})/i);
  if (!match || Number(match[2]) <= 0 || Number(match[2]) > 1000) {
    return { status: 'unknown', totalPoints: null };
  }

  return {
    status: match[1] === '*' ? 'ungraded' : 'graded',
    ...(match[1] === '*' ? {} : { earnedPoints: Number(match[1]) }),
    totalPoints: Number(match[2])
  };
}

function assignmentCacheKey(assignment) {
  return [assignment.assignmentId, assignment.classId, assignment.studentId].filter(Boolean).join(':');
}

function assignmentFingerprint(assignment) {
  const hint = assignment.rowScoreHint || { status: 'unknown', earnedPoints: null, totalPoints: null };
  return {
    assignmentId: assignment.assignmentId || null,
    entityId: assignment.entityId || null,
    classId: assignment.classId || null,
    studentId: assignment.studentId || null,
    name: assignment.name || '',
    dueDate: normalizeDueDate(assignment.dueDate) || assignment.dueDate || null,
    scoreStatus: hint.status,
    earnedPoints: hint.earnedPoints ?? null,
    totalPoints: hint.totalPoints ?? null
  };
}

function fingerprintsMatch(left, right) {
  return Boolean(left && right && JSON.stringify(left) === JSON.stringify(right));
}

function canUseCachedAssignment(assignment, cached, forceRefresh = process.env.SKYWARD_FORCE_REFRESH === '1') {
  if (forceRefresh || !cached?.fingerprint) return false;
  const hint = assignment.rowScoreHint;
  if (!hint || hint.status === 'unknown') return false;
  return fingerprintsMatch(cached.fingerprint, assignmentFingerprint(assignment));
}

async function readJsonIfExists(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function loadCache() {
  const cachePath = path.join(__dirname, CACHE_FILENAME);
  const existing = await readJsonIfExists(cachePath);

  return {
    path: cachePath,
    assignments: existing?.assignments ?? {},
    updatedAt: existing?.updatedAt ?? null
  };
}

async function saveCache(cachePath, assignments) {
  const payload = {
    updatedAt: new Date().toISOString(),
    assignments
  };

  const previous = await readJsonIfExists(cachePath);
  if (previous && JSON.stringify(previous.assignments ?? {}) === JSON.stringify(assignments)) {
    return false;
  }

  await fs.writeFile(cachePath, JSON.stringify(payload, null, 2));
  return true;
}

async function saveJsonIfChanged(filePath, value, comparableValue = value) {
  const previous = await readJsonIfExists(filePath);
  if (previous && JSON.stringify(previous) === JSON.stringify(comparableValue)) {
    return false;
  }
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
  return true;
}

async function loginAndNavigateToGradebook() {
  const username = process.env.SKYWARD_USERNAME;
  const password = process.env.SKYWARD_PASSWORD;

  if (!username || !password) {
    throw new Error('SKYWARD_USERNAME and SKYWARD_PASSWORD must be set');
  }

  console.log('Launching browser...');
  const browser = await chromium.launch({
    headless: true
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Logging in to Skyward...');
  await page.goto('https://skyweb.aasdcat.com/scripts/wsisa.dll/WService=wsEAplus/seplog01.w');
  await page.fill('input[name="login"]', username);
  await page.fill('input[name="password"]', password);

  // Wait for popup after login
  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.press('input[name="password"]', 'Enter')
  ]);

  await popup.waitForLoadState('networkidle');
  await popup.waitForTimeout(2000);

  // Handle password change prompt if it appears
  const pageContent = await popup.content();
  if (pageContent.toLowerCase().includes('password') &&
      (pageContent.toLowerCase().includes('change') || pageContent.toLowerCase().includes('update'))) {
    console.log('Attempting to skip password change...');
    const skipSelectors = [
      'button:has-text("Skip")',
      'button:has-text("Cancel")',
      'button:has-text("Later")',
      'a:has-text("Skip")'
    ];

    for (const selector of skipSelectors) {
      try {
        await popup.click(selector, { timeout: 2000 });
        await popup.waitForLoadState('networkidle');
        break;
      } catch (e) {
        // Try next selector
      }
    }
  }

  // Navigate to Gradebook
  console.log('Navigating to Gradebook...');
  const gradebookSelectors = [
    'a:has-text("Gradebook")',
    'text=Gradebook',
    '[title*="Gradebook"]'
  ];

  for (const selector of gradebookSelectors) {
    try {
      await popup.waitForSelector(selector, { timeout: 10000 });
      await popup.click(selector);
      console.log(`Clicked Gradebook using: ${selector}`);
      break;
    } catch (e) {
      // Try next
    }
  }

  await popup.waitForLoadState('networkidle');
  await popup.waitForTimeout(2000);

  console.log('Successfully navigated to Gradebook');
  return { browser, popup };
}

async function expandAllClasses(page) {
  console.log('Expanding all classes...');

  // Click all expander links to show assignments
  await page.evaluate(() => {
    const expanders = document.querySelectorAll('a.sf_expander');
    expanders.forEach(expander => expander.click());
  });

  await page.waitForTimeout(500);
}

async function expandAllAssignments(page) {
  console.log('Expanding assignments within each class (Next ... links) until exhausted...');
  for (let i = 0; i < 50; i++) {
    const clicked = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[id^="moreAssignmentsEvents_"]'));
      const nextLink = links.find((link) => link.offsetParent !== null);
      if (nextLink) {
        nextLink.click();
        return true;
      }
      return false;
    });

    if (!clicked) {
      break;
    }

    await page.waitForTimeout(300);
  }
}

async function getClassInfo(page) {
  console.log('Extracting class information...');

  return page.evaluate(() => {
    const classes = [];
    const classIdMap = {};
    const classInfoByGroupId = new Map();

    const recordClass = (id, info) => {
      if (!id) return;
      classIdMap[id] = classIdMap[id]
        ? { ...info, ...classIdMap[id] }
        : info;
    };
    const classTables = document.querySelectorAll('table[id^="classDesc_"]');

    classTables.forEach(table => {
      const tableId = table.getAttribute('id');
      const groupId = tableId.replace('classDesc_', '');

      const classNameElement = table.querySelector('.classDesc a');
      if (!classNameElement) return;

      const className = classNameElement.textContent.trim();

      // Get period
      const cellText = table.textContent;
      const periodMatch = cellText.match(/Period\s*(\d+|[A-Z])/);
      const period = periodMatch ? periodMatch[1] : '';

      // Get teacher
      const teacherLinks = table.querySelectorAll('tr');
      let teacher = '';
      if (teacherLinks.length >= 3) {
        const teacherRow = teacherLinks[2];
        const teacherLink = teacherRow.querySelector('a');
        if (teacherLink) {
          teacher = teacherLink.textContent.trim();
        }
      }

      // Get the active grade from the highlighted quarter column.
      const gradeRow = document.querySelector(`tr[group-parent="${groupId}"]`);
      let currentGrade = null;
      let currentQuarter = null;
      let isHighlighted = false;

      if (gradeRow) {
        const highlightedCell = gradeRow.querySelector('.sf_highlightYellow');
        const gradeCells = gradeRow.querySelectorAll('td');
        isHighlighted = highlightedCell !== null;

        // Skyward's column positions can change, so identify the quarter from
        // the grade-table header instead of assuming Q4 is a fixed cell.
        if (highlightedCell) {
          const gradeTable = gradeRow.closest('table');
          const highlightedIndex = Array.from(gradeCells).indexOf(highlightedCell.closest('td'));
          const headerRows = gradeTable ? Array.from(gradeTable.querySelectorAll('tr')) : [];
          const headerRow = headerRows.find(row => {
            const labels = Array.from(row.querySelectorAll('th, td')).map(cell => cell.textContent.trim());
            return labels.some(label => /^Q[1-4]$/.test(label));
          });
          const headerCells = headerRow ? Array.from(headerRow.querySelectorAll('th, td')) : [];
          const headerLabel = headerCells[highlightedIndex]?.textContent.trim();
          if (/^Q[1-4]$/.test(headerLabel || '')) {
            currentQuarter = headerLabel;
          }
        }

        const gradeCell = highlightedCell?.closest('td')
          || Array.from(gradeCells).find(cell => cell.querySelector('a[id="showGradeInfo"]'))
          || gradeCells[3];
        const gradeLink = gradeCell?.querySelector('a[id="showGradeInfo"]');

        if (gradeLink) {
          const gradeText = gradeLink.textContent?.trim().replace(/%/g, '');
          const grade = Number(gradeText);
          if (Number.isFinite(grade) && grade >= 0 && grade <= 100) {
            currentGrade = grade;
          }
        }

        // Highlighted but no current-quarter value present: treat as 0 until posted.
        if (isHighlighted && currentGrade === null) {
          currentGrade = 0;
        }
      }

      // Keep every class description so assignment links can still be mapped
      // when the portal has not highlighted the active quarter yet.
      if (className) {
        const entry = {
          className,
          teacher,
          period,
          groupId,
          currentGrade,
          currentQuarter,
          ...(currentQuarter ? { [`${currentQuarter.toLowerCase()}_grade`]: currentGrade } : {})
        };

        classes.push(entry);
        classInfoByGroupId.set(groupId, entry);
        recordClass(groupId, entry);
      }
    });

    // Map assignment class ids to class info using row group attributes or nearby class tables.
    const assignmentLinks = document.querySelectorAll('a#showAssignmentInfo');
    assignmentLinks.forEach(link => {
      const classId = link.getAttribute('data-gid');
      if (!classId) return;

      const row = link.closest('tr');
      let classInfo = null;

      if (row) {
        const groupId = row.getAttribute('group-child') || row.getAttribute('group-parent');
        if (groupId) {
          classInfo = classInfoByGroupId.get(groupId) || null;
        }

        if (!classInfo) {
          let current = row;
          while (current) {
            let prev = current.previousElementSibling;
            while (prev) {
              if (prev.matches?.('table[id^="classDesc_"]')) {
                const tableId = prev.getAttribute('id') || '';
                const lookupId = tableId.replace('classDesc_', '');
                classInfo = classInfoByGroupId.get(lookupId) || null;
                break;
              }
              prev = prev.previousElementSibling;
            }
            if (classInfo) break;
            current = current.parentElement;
          }
        }
      }

      if (classInfo) {
        recordClass(classId, classInfo);
      }
    });

    const highlightedQuarter = classes.find(entry => entry.currentQuarter)?.currentQuarter || null;
    return { classes, classIdMap, currentQuarter: highlightedQuarter };
  });
}

async function getAssignmentLinks(page) {
  console.log('Collecting assignment links...');

  return page.evaluate(() => {
    const assignments = [];
    const assignmentLinks = document.querySelectorAll('a#showAssignmentInfo');

    assignmentLinks.forEach((link, index) => {
      // Check if the assignment row is visible
      const row = link.closest('tr');
      if (!row || row.offsetParent === null) return;

      const assignmentId = link.getAttribute('data-aid');
      const entityId = link.getAttribute('data-eid');
      const classId = link.getAttribute('data-gid');
      const studentId = link.getAttribute('data-sid');
      const name = link.textContent.trim();

      // Get due date from the row
      const dueSpan = row.querySelector('span.fXs');
      const dueDate = dueSpan ? dueSpan.textContent.trim() : null;
      const scoreText = row.textContent || '';
      const scoreMatch = scoreText.match(/(\*|\d+(?:\.\d+)?)\s*(?:\/|out\s*of)\s*(\d+(?:\.\d+)?)(?!\s*\/\s*\d{2,4})/i);
      const rowScoreHint = scoreMatch && Number(scoreMatch[2]) > 0 && Number(scoreMatch[2]) <= 1000
        ? { status: scoreMatch[1] === '*' ? 'ungraded' : 'graded', earnedPoints: scoreMatch[1] === '*' ? null : Number(scoreMatch[1]), totalPoints: Number(scoreMatch[2]) }
        : { status: 'unknown', totalPoints: null };

      // Try to find the class name from nearby DOM elements
      // Look for the closest class description table above this assignment
      let classNameFromDOM = '';
      let periodFromDOM = '';
      let teacherFromDOM = '';
      const groupIdHint = row.getAttribute('group-child') || row.getAttribute('group-parent') || '';

      if (groupIdHint) {
        const classTable = document.getElementById(`classDesc_${groupIdHint}`);
        if (classTable) {
          const classLink = classTable.querySelector('.classDesc a');
          if (classLink) classNameFromDOM = classLink.textContent.trim();
          const periodMatch = classTable.textContent.match(/Period\s*(\d+|[A-Z])/);
          if (periodMatch) periodFromDOM = periodMatch[1];
          const teacherLink = classTable.querySelector('tr:nth-of-type(3) a');
          if (teacherLink) teacherFromDOM = teacherLink.textContent.trim();
        }
      }

      // Walk up from the row to find the parent class section
      let current = row;
      while (current && !classNameFromDOM) {
        // Look backwards for a class description table
        let prev = current.previousElementSibling;
        while (prev) {
          if (prev.matches && prev.matches('table[id^="classDesc_"]')) {
            const classLink = prev.querySelector('.classDesc a');
            if (classLink) classNameFromDOM = classLink.textContent.trim();
            const periodMatch = prev.textContent.match(/Period\s*(\d+|[A-Z])/);
            if (periodMatch) periodFromDOM = periodMatch[1];
            const teacherLink = prev.querySelector('tr:nth-of-type(3) a');
            if (teacherLink) teacherFromDOM = teacherLink.textContent.trim();
            break;
          }
          prev = prev.previousElementSibling;
        }
        current = current.parentElement;
      }

      assignments.push({
        index,
        assignmentId,
        entityId,
        classId,
        studentId,
        name,
        dueDate,
        classNameHint: classNameFromDOM,
        periodHint: periodFromDOM,
        teacherHint: teacherFromDOM,
        groupIdHint,
        rowScoreHint
      });
    });

    return assignments;
  });
}

function parseAssignmentDetails(html) {
  const $ = cheerio.load(String(html || ''));
  const scope = $.root();
  const text = scope.text() || '';
  const pointsPatterns = [
    /Points\s*Earned[:\s]*([*]|[\d.]+)\s*(?:\/|out\s*of)\s*([\d.]+)/i,
    /Earned\s*Points[:\s]*([*]|[\d.]+)\s*(?:\/|out\s*of)\s*([\d.]+)/i,
    /Score[:\s]*([*]|[\d.]+)\s*(?:\/|out\s*of)\s*([\d.]+)/i,
    /Grade[:\s]*([*]|[\d.]+)\s*(?:\/|out\s*of)\s*([\d.]+)/i,
    /(?:Points|Earned|Score)[^0-9*]{0,50}([*]|[\d.]+)\s*\/\s*([\d.]+)/i
  ];
  let earnedRaw = null;
  let totalRaw = null;
  for (const pattern of pointsPatterns) {
    const match = text.match(pattern);
    if (match) {
      earnedRaw = match[1];
      totalRaw = match[2];
      break;
    }
  }
  if (!totalRaw) totalRaw = text.match(/out\s*of\s*([\d.]+)/i)?.[1] || null;
  if (!totalRaw) {
    totalRaw = text.match(/(?:Total|Max(?:imum)?|Possible)\s*Points?[^\d]*([\d.]+)/i)?.[1]
      || text.match(/Points?\s*(?:Possible|Total|Max(?:imum)?)[^\d]*([\d.]+)/i)?.[1]
      || null;
  }
  if (!earnedRaw || !totalRaw) {
    $('tr').each((_, row) => {
      if (earnedRaw && totalRaw) return;
      const rowText = $(row).text();
      if (!/Points|Earned|Score/i.test(rowText)) return;
      const match = rowText.match(/([*]|[\d.]+)\s*\/\s*([\d.]+)/);
      if (match) {
        earnedRaw = match[1];
        totalRaw = match[2];
      }
    });
  }
  if (!earnedRaw || !totalRaw) {
    const scoreText = text.replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, '');
    for (const match of scoreText.matchAll(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/g)) {
      const earned = Number(match[1]);
      const total = Number(match[2]);
      if (earned < 1000 && total < 1000 && total > 0) {
        earnedRaw = match[1];
        totalRaw = match[2];
        break;
      }
    }
  }
  const parseNumber = raw => {
    if (!raw) return { value: null, hasStar: false };
    const trimmed = raw.trim();
    const hasStar = trimmed === '*';
    const value = Number.parseFloat(trimmed.replace(/[^0-9.]/g, ''));
    return { value: Number.isNaN(value) ? null : value, hasStar };
  };
  const normalizeDate = raw => {
    if (!raw) return null;
    const value = raw.trim();
    const looksLikeDate = /[0-9]{1,2}\/[0-9]{1,2}/.test(value) || /[A-Za-z]{3}/.test(value) || /[0-9]{4}/.test(value);
    if (/^[0-9]+(?:\.[0-9]+)?$/.test(value) && !looksLikeDate) return null;
    if (/Assign\s*Date|Points\s*Earned/i.test(value)) return null;
    return value;
  };
  const earnedParsed = parseNumber(earnedRaw);
  const totalParsed = parseNumber(totalRaw);
  const percentValue = Number(text.match(/([0-9]{1,3})\s*%/)?.[1]);
  let earnedPoints = earnedParsed.value;
  let totalPoints = totalParsed.value;
  let graded = earnedPoints !== null && !earnedParsed.hasStar;
  const hasStar = earnedParsed.hasStar;
  if (totalPoints === 0) totalPoints = null;
  if (hasStar) {
    graded = false;
    earnedPoints = 0;
  }
  if (!graded && !hasStar && totalPoints !== null && Number.isFinite(percentValue)) {
    earnedPoints = Math.round((percentValue / 100) * totalPoints * 100) / 100;
    graded = true;
  }
  if (!hasStar && totalPoints !== null && Number.isFinite(percentValue) && percentValue >= 0 && (earnedPoints === null || (earnedPoints === 0 && percentValue > 0))) {
    earnedPoints = Math.round((percentValue / 100) * totalPoints * 100) / 100;
    graded = true;
  }
  const dueCell = $('div:nth-of-type(2) div table tbody tr:nth-of-type(2) td:nth-of-type(4)').first().text().trim() || null;
  const dateDueMatch = text.match(/Date\s*Due[^0-9]*([0-9/]+)/i) || text.match(/Due\s*Date[^0-9]*([0-9/]+)/i);
  const weightMatch = text.match(/Weight[^0-9]*([\d.]+)%?/i);
  return {
    graded,
    earnedPoints,
    totalPoints,
    weight: weightMatch ? Number.parseFloat(weightMatch[1]) : null,
    dateDue: normalizeDate(dueCell) || (dateDueMatch ? normalizeDate(dateDueMatch[1]) : null),
    hasStar
  };
}

async function extractAssignmentDetails(page, assignmentId, classId, options = {}) {
  try {
    const assertPageOpen = () => {
      if (page.isClosed()) {
        console.error(`Page/context unexpectedly closed during UI fallback for assignment ${assignmentId}`);
        const error = new Error('Skyward gradebook page/context unexpectedly closed');
        error.code = 'SKYWARD_PAGE_CLOSED';
        throw error;
      }
    };
    assertPageOpen();
    // Click the assignment link with matching data attributes
    const selector = `a#showAssignmentInfo[data-aid="${assignmentId}"][data-gid="${classId}"]`;
    const link = page.locator(selector).first();

    const dialogLocator = page.locator('.sf_Dialog:visible, .ui-dialog:visible, [role="dialog"]:visible').first();
    const dialogTimeoutMs = options.dialogTimeoutMs ?? 5000;
    await link.waitFor({ state: 'visible', timeout: 5000 });
    if (await dialogLocator.isVisible()) {
      throw new Error(`Assignment dialog was already visible before clicking ${assignmentId}`);
    }
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      assertPageOpen();
      if (attempt > 1 && await dialogLocator.isVisible()) break;
      await link.click();
      assertPageOpen();
      try {
        await dialogLocator.waitFor({ state: 'visible', timeout: dialogTimeoutMs });
        break;
      } catch (error) {
        assertPageOpen();
        if (await dialogLocator.isVisible()) break;
        if (attempt === 2) {
          throw new Error(`No visible assignment dialog for ${assignmentId} after 2 clicks`, { cause: error });
        }
        console.warn(`Dialog did not open for assignment ${assignmentId}; retrying click`);
      }
    }
    console.log(`Dialog opened for assignment ${assignmentId}`);

    // Extract the assignment details from the modal
    const details = await page.evaluate(() => {
      const dialog = Array.from(document.querySelectorAll('.sf_Dialog, .ui-dialog, [role="dialog"]'))
        .find((candidate) => {
          const style = getComputedStyle(candidate);
          const rect = candidate.getBoundingClientRect();
          return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
        });
      const scope = dialog || document.body;
      const text = scope.innerText || '';

      const getTextAtXPath = (xpath) => {
        try {
          const result = document.evaluate(xpath, document, null, XPathResult.STRING_TYPE, null);
          const value = result.stringValue?.trim();
          return value || null;
        } catch (e) {
          return null;
        }
      };

      const parseNumber = (raw) => {
        if (!raw) return { value: null, hasStar: false };
        const trimmed = raw.trim();
        const hasStar = trimmed === '*';
        const numeric = parseFloat(trimmed.replace(/[^0-9.]/g, ''));
        if (Number.isNaN(numeric)) {
          return { value: null, hasStar };
        }
        return { value: numeric, hasStar };
      };

      // Strategy: Try multiple approaches to extract points earned and total
      let earnedRaw = null;
      let totalRaw = null;

      // Approach 1: Search for "Points Earned" or similar labels in the full dialog text
      const pointsPatterns = [
        /Points\s*Earned[:\s]*([*]|[\d.]+)\s*(?:\/|out\s*of)\s*([\d.]+)/i,
        /Earned\s*Points[:\s]*([*]|[\d.]+)\s*(?:\/|out\s*of)\s*([\d.]+)/i,
        /Score[:\s]*([*]|[\d.]+)\s*(?:\/|out\s*of)\s*([\d.]+)/i,
        /Grade[:\s]*([*]|[\d.]+)\s*(?:\/|out\s*of)\s*([\d.]+)/i,
        // More generic: any number/star followed by slash and another number
        // But only if it appears AFTER "Points" or similar keyword
        /(?:Points|Earned|Score)[^0-9*]{0,50}([*]|[\d.]+)\s*\/\s*([\d.]+)/i
      ];

      for (const pattern of pointsPatterns) {
        const match = text.match(pattern);
        if (match) {
          earnedRaw = match[1];
          totalRaw = match[2];
          break;
        }
      }

      // If we still don't have totalRaw but see "out of X", capture X
      if (!totalRaw) {
        const outOfMatch = text.match(/out\s*of\s*([\d.]+)/i);
        if (outOfMatch) {
          totalRaw = outOfMatch[1];
        }
      }

      // Approach 2: Look in specific table cells
      if (!earnedRaw || !totalRaw) {
        // Try to find the points cell more reliably
        const allTables = scope.querySelectorAll('table');
        for (const table of allTables) {
          const rows = table.querySelectorAll('tr');
          for (const row of rows) {
            const rowText = row.textContent || '';
            // If this row mentions "Points" or "Earned", look for the pattern
            if (/Points|Earned|Score/i.test(rowText)) {
              const cellMatch = rowText.match(/([*]|[\d.]+)\s*\/\s*([\d.]+)/);
              if (cellMatch && !earnedRaw && !totalRaw) {
                earnedRaw = cellMatch[1];
                totalRaw = cellMatch[2];
                break;
              }
            }
          }
          if (earnedRaw && totalRaw) break;
        }
      }

      // Approach 3: Generic slash pattern as last resort (but filter out dates)
      if (!earnedRaw || !totalRaw) {
        // Find all X / Y patterns and pick the first one that doesn't look like a date
        const allMatches = text.matchAll(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/g);
        for (const match of allMatches) {
          const val1 = parseFloat(match[1]);
          const val2 = parseFloat(match[2]);
          // Filter out dates (numbers > 2000 are likely years)
          // Also filter out ratios that don't make sense for grades (e.g., > 1000)
          if (val1 < 1000 && val2 < 1000 && val2 > 0) {
            earnedRaw = match[1];
            totalRaw = match[2];
            break;
          }
        }
      }

      // Get dates from selectors (but validate they look like dates, not points)
      const dueDateRaw = scope.querySelector('div:nth-of-type(2) div table tbody tr:nth-of-type(2) td:nth-of-type(4)')?.textContent?.trim() || null;

      const normalizeDate = (raw) => {
        if (!raw) return null;
        const val = raw.trim();
        const looksLikeDate =
          /[0-9]{1,2}\/[0-9]{1,2}/.test(val) ||
          /[A-Za-z]{3}/.test(val) ||
          /[0-9]{4}/.test(val);
        const looksLikePointsOnly = /^[0-9]+(\.[0-9]+)?$/.test(val);
        if (looksLikePointsOnly && !looksLikeDate) return null;
        if (/Assign\s*Date/i.test(val) || /Points\s*Earned/i.test(val)) return null;
        return val;
      };

      const percentMatch = text.match(/([0-9]{1,3})\s*%/);
      const percentValue = percentMatch ? Number(percentMatch[1]) : null;

      const earnedParsed = parseNumber(earnedRaw);
      const totalParsed = parseNumber(totalRaw);

      let earnedPoints = earnedParsed.value;
      let totalPoints = totalParsed.value;
      let graded = Boolean(earnedPoints !== null && !earnedParsed.hasStar);
      let hasStar = earnedParsed.hasStar;

      // If we still don't have totalPoints, it's truly missing
      if (totalPoints === null || totalPoints === 0) {
        // Keep as null - this assignment doesn't have a total points value
        totalPoints = null;
      }

      // Explicitly mark star rows as ungraded 0 out of X so they do not cache
      if (hasStar) {
        graded = false;
        earnedPoints = 0;
      }

      // Fallback: derive earned from percentage when points aren't parsed.
      // Never apply this to ungraded (*) assignments — hasStar takes precedence.
      if (!graded && !hasStar && totalPoints !== null && Number.isFinite(percentValue)) {
        earnedPoints = Math.round((percentValue / 100) * totalPoints * 100) / 100;
        graded = true;
      }

      // If points parsed as 0 but percentage indicates credit, recompute from percent.
      // Skip if the earned value was explicitly a star (ungraded).
      if (
        !hasStar &&
        totalPoints !== null &&
        Number.isFinite(percentValue) &&
        percentValue >= 0 &&
        (earnedPoints === null || (earnedPoints === 0 && percentValue > 0))
      ) {
        earnedPoints = Math.round((percentValue / 100) * totalPoints * 100) / 100;
        graded = true;
      }

      // Weight: look for "Weight: 15%" or "Weight 15%"
      const weightMatch = text.match(/Weight[^0-9]*([\d.]+)%?/i);
      const weight = weightMatch ? parseFloat(weightMatch[1]) : null;

      const dateDueMatch =
        text.match(/Date\s*Due[^0-9]*([0-9/]+)/i) ||
        text.match(/Due\s*Date[^0-9]*([0-9/]+)/i);

      return {
        graded,
        earnedPoints,
        totalPoints,
        weight,
        dateDue: normalizeDate(dueDateRaw) || (dateDueMatch ? normalizeDate(dateDueMatch[1]) : null),
        hasStar
      };
    });

    assertPageOpen();
    if (await dialogLocator.isVisible()) {
      const closeSelectors = [
        '.sf_DialogClose',
        'button:has-text("Close")',
        'button:has-text("OK")',
        'a:has-text("Close")',
        'button.close',
        '[aria-label="Close"]',
        'button[title="Close"]'
      ];

      for (const selector of closeSelectors) {
        const closeControl = dialogLocator.locator(selector).first();
        if (!await closeControl.isVisible()) continue;
        try {
          await closeControl.click({ timeout: 200 });
          assertPageOpen();
          break;
        } catch (error) {
          assertPageOpen();
        }
      }

      if (await dialogLocator.isVisible()) {
        await page.keyboard.press('Escape');
        assertPageOpen();
      }
    }
    await dialogLocator.waitFor({ state: 'hidden', timeout: 2000 });
    assertPageOpen();
    console.log(`Dialog closed for assignment ${assignmentId}`);

    return details;

  } catch (error) {
    console.error(`Error extracting details for assignment ${assignmentId}:`, error.message);
    throw error;
  }
}

async function fetchAssignmentDetails(page, assignment, options = {}) {
  const timeoutMs = options.timeoutMs ?? 8000;
  const modeTimeoutMs = options.modeTimeoutMs ?? Math.min(timeoutMs, 2000);
  const retries = options.retries ?? 2;
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const result = await page.evaluate(({ assignment: item, timeout, modeTimeout }) => new Promise((resolve, reject) => {
        if (!window.sff || typeof window.sff.request !== 'function') {
          reject(new Error('Skyward sff.request is unavailable'));
          return;
        }
        const link = document.querySelector(`a#showAssignmentInfo[data-aid="${CSS.escape(String(item.assignmentId))}"][data-gid="${CSS.escape(String(item.classId))}"]`);
        const modes = window.__skywardDetailRequestMode
          ? [window.__skywardDetailRequestMode]
          : ['data', 'element', 'positional', 'named'];
        const requestArgs = {
          eid: item.entityId,
          entityId: item.entityId,
          sid: item.studentId,
          gid: item.classId,
          aid: item.assignmentId
        };
        const responseHtml = response => {
          const values = Array.isArray(response) ? response : [response];
          for (const candidate of values.reverse()) {
            const value = typeof candidate === 'string'
              ? candidate
              : candidate?.responseText || candidate?.html || candidate?.data || candidate?.content;
            if (typeof value === 'string' && value.trim()) return value;
          }
          return null;
        };
        const invoke = (mode, callback) => {
          if (mode === 'element') return window.sff.request(link, callback);
          if (mode === 'positional') return window.sff.request(item.entityId, item.studentId, item.classId, item.assignmentId, callback);
          if (mode === 'named') return window.sff.request({ entityId: item.entityId, studentId: item.studentId, classId: item.classId, assignmentId: item.assignmentId }, callback);
          return window.sff.request(requestArgs, callback);
        };
        const tryMode = mode => new Promise((resolveMode, rejectMode) => {
          let settled = false;
          const timer = setTimeout(() => {
            if (!settled) {
              settled = true;
              rejectMode(new Error(`Skyward detail request timed out (${mode})`));
            }
          }, modeTimeout);
          const finish = (callback, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            callback(value);
          };
          const callback = (...responses) => {
            const html = responseHtml(responses);
            if (!html) {
              finish(rejectMode, new Error(`Skyward detail request returned no HTML (${mode})`));
              return;
            }
            window.__skywardDetailRequestMode = mode;
            finish(resolveMode, { html, mode, arity: window.sff.request.length });
          };
          try {
            invoke(mode, callback);
          } catch (error) {
            finish(rejectMode, error);
          }
        });
        (async () => {
          let lastModeError;
          for (const mode of modes) {
            try {
              resolve(await tryMode(mode));
              return;
            } catch (error) {
              lastModeError = error;
            }
          }
          reject(lastModeError || new Error('No Skyward request mode succeeded'));
        })();
      }), { assignment, timeout: timeoutMs, modeTimeout: modeTimeoutMs });
      const details = parseAssignmentDetails(result.html);
      if (!details || (details.totalPoints === null && !details.hasStar && !details.dateDue && details.earnedPoints === null)) {
        await page.evaluate(() => { delete window.__skywardDetailRequestMode; });
        throw new Error('Skyward detail response could not be parsed');
      }
      if (options.logContract) {
        console.log(`Skyward sff.request contract: ${result.mode} (arity ${result.arity})`);
      }
      return details;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await page.waitForTimeout(100 * attempt);
    }
  }
  throw lastError;
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const runWorker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      try {
        results[index] = { value: await worker(items[index], index) };
      } catch (error) {
        results[index] = { error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return results;
}

async function scrapeAllAssignments(page, classes, cacheAssignments = {}, classIdMap = {}, currentQuarter = null) {
  console.log('\nExtracting detailed assignment information...');

  // Get all assignment links
  const assignmentLinks = await getAssignmentLinks(page);
  console.log(`Found ${assignmentLinks.length} assignments total`);
  const classIdCounts = {};
  assignmentLinks.forEach(a => { classIdCounts[a.classId] = (classIdCounts[a.classId] || 0) + 1; });
  console.log('Assignment links by classId:', Object.entries(classIdCounts).map(([id, count]) => `${id}:${count}`).join(', '));
  console.log('Sample assignment links with hints:', assignmentLinks.slice(0, 5).map(a => `${a.name} (classId=${a.classId}, hint="${a.classNameHint}", period=${a.periodHint})`).join('; '));
  const maxAssignments = parseInt(process.env.SKYWARD_MAX_ASSIGNMENTS || '', 10);
  const assignmentLimit = Number.isFinite(maxAssignments) && maxAssignments > 0
    ? Math.min(maxAssignments, assignmentLinks.length)
    : assignmentLinks.length;
  if (assignmentLimit !== assignmentLinks.length) {
    console.log(`Limiting assignment detail scrape to ${assignmentLimit} items (SKYWARD_MAX_ASSIGNMENTS).`);
  }

  const assignmentDetails = [];
  const updatedCache = { ...cacheAssignments };
  let cacheHits = 0;
  const currentKeys = new Set();

  const detailStartedAt = Date.now();
  const candidates = [];
  for (let i = 0; i < assignmentLimit; i += 1) {
    const assignment = assignmentLinks[i];
    const dueQuarter = assignment.dueDate?.match(/\(Q([1-4])\)/i)?.[1] || null;
    if (currentQuarter && dueQuarter && dueQuarter !== currentQuarter.slice(1)) continue;
    const cacheKey = assignmentCacheKey(assignment);
    if (cacheKey) currentKeys.add(cacheKey);
    const cached = cacheKey ? cacheAssignments[cacheKey] : null;
    const details = canUseCachedAssignment(assignment, cached) ? cached : null;
    if (details) cacheHits += 1;
    candidates.push({ assignment, cacheKey, cached, details, index: i });
  }
  console.log(`Discovered assignments: ${candidates.length}`);

  const uncached = candidates.filter(candidate => !candidate.details);
  const concurrencyValue = Number.parseInt(process.env.SKYWARD_CONCURRENCY || '5', 10);
  const concurrency = Number.isFinite(concurrencyValue) && concurrencyValue > 0 ? concurrencyValue : 5;
  let directRequests = 0;
  let directFailures = 0;
  let directCandidates = uncached;
  const unresolved = [];
  if (uncached.length > 0) {
    const probe = uncached[0];
    directRequests += 1;
    try {
      probe.details = await fetchAssignmentDetails(page, probe.assignment, { retries: 1, modeTimeoutMs: 1500, logContract: true });
      directCandidates = uncached.slice(1);
      console.log(`Skyward detail request contract selected for ${probe.assignment.name}`);
    } catch (error) {
      directFailures += 1;
      directCandidates = [];
      unresolved.push(...uncached.map(candidate => ({ candidate, error })));
      console.log(`Skyward detail request contract probe failed; using UI fallback for ${uncached.length} assignments: ${error.message}`);
    }
  }
  const directResults = await mapWithConcurrency(directCandidates, concurrency, async candidate => {
    directRequests += 1;
    try {
      const details = await fetchAssignmentDetails(page, candidate.assignment);
      return details;
    } catch (error) {
      directFailures += 1;
      console.log(`Direct detail request failed for ${candidate.assignment.name}: ${error.message}`);
      throw error;
    }
  });

  directResults.forEach((result, index) => {
    if (result.value) {
      directCandidates[index].details = result.value;
    } else {
      unresolved.push({ candidate: directCandidates[index], error: result.error });
    }
  });

  let uiFallbacks = 0;
  for (const failed of unresolved) {
    if (page.isClosed()) {
      console.error('Page/context unexpectedly closed during UI fallback');
      const error = new Error('Skyward gradebook page/context unexpectedly closed');
      error.code = 'SKYWARD_PAGE_CLOSED';
      throw error;
    }
    uiFallbacks += 1;
    const { candidate } = failed;
    console.log(`UI fallback ${uiFallbacks}/${unresolved.length}: ${candidate.assignment.name}`);
    try {
      candidate.details = await extractAssignmentDetails(page, candidate.assignment.assignmentId, candidate.assignment.classId);
    } catch (error) {
      failed.error = error;
      if (page.isClosed() || error.code === 'SKYWARD_PAGE_CLOSED') throw error;
    }
  }
  const stillUnresolved = unresolved.filter(({ candidate }) => !candidate.details);
  if (stillUnresolved.length > 0) {
    const unresolvedError = new Error(`Unable to resolve ${stillUnresolved.length} assignment detail(s): ${stillUnresolved.map(({ candidate }) => candidate.assignment.name).join(', ')}`);
    unresolvedError.code = 'UNRESOLVED_ASSIGNMENT_DETAILS';
    throw unresolvedError;
  }
  console.log(`Detail phase duration: ${Date.now() - detailStartedAt}ms`);

  for (const candidate of candidates) {
    const { assignment, cacheKey, cached } = candidate;
    let details = candidate.details;

    if (assignment.rowScoreHint.status === 'ungraded') {
      details = {
        ...details,
        graded: false,
        earnedPoints: 0,
        totalPoints: details.totalPoints ?? assignment.rowScoreHint.totalPoints
      };
    }

    // Find which class this assignment belongs to
    const fromMap = classIdMap[assignment.classId];
    const fromGroupHint = assignment.groupIdHint
      ? classes.find(c => c.groupId === assignment.groupIdHint)
      : null;
    const fromArray = classes.find(c => c.groupId === assignment.classId);
    const classInfo = fromMap || fromGroupHint || fromArray;

    if (assignmentDetails.length < 10) {
      console.log(`  Assignment classId=${assignment.classId}:`);
      console.log(`    - classIdMap[${assignment.classId}]:`, fromMap ? `${fromMap.className} (period ${fromMap.period})` : 'NOT IN MAP');
      console.log(`    - classes.find(groupId=${assignment.classId}):`, fromArray ? `${fromArray.className} (period ${fromArray.period})` : 'NOT IN ARRAY');
      console.log(`    - final classInfo:`, classInfo ? `${classInfo.className} (period ${classInfo.period})` : 'NOT FOUND');
    }

    const className = classInfo?.className || cached?.className || assignment.classNameHint || assignment.classId || 'Unknown';
    const teacher = classInfo?.teacher || cached?.teacher || assignment.teacherHint || '';
    const period = classInfo?.period || cached?.period || assignment.periodHint || '';
    const dateDue = normalizeDueDate(details.dateDue || assignment.dueDate || null);
    const graded = Boolean(details.graded);
    const earnedPoints = graded ? details.earnedPoints ?? 0 : 0;
    const totalPoints = details.totalPoints ?? 0;

    const assignmentData = {
      classId: assignment.classId,
      assignmentId: assignment.assignmentId,
      studentId: assignment.studentId,
      className,
      teacher,
      period,
      currentGrade: classInfo?.currentGrade ?? cached?.currentGrade ?? null,
      assignmentName: assignment.name,
      dateDue,
      dueDate: dateDue,
      earnedPoints,
      totalPoints,
      weight: details.weight ?? null,
      graded
    };

    if (cacheKey) {
      updatedCache[cacheKey] = {
        ...assignmentData,
        fingerprint: assignmentFingerprint(assignment),
        cachedAt: new Date().toISOString()
      };
    }

    assignmentDetails.push(assignmentData);
  }

  let cacheEntriesPruned = 0;
  for (const key of Object.keys(updatedCache)) {
    if (!currentKeys.has(key)) {
      delete updatedCache[key];
      cacheEntriesPruned += 1;
    }
  }

  console.log(`Metadata rows scanned: ${assignmentLinks.length}`);
  console.log(`Cache hits: ${cacheHits}`);
  console.log(`Direct requests: ${directRequests}`);
  console.log(`Direct request failures: ${directFailures}`);
  console.log(`UI fallbacks: ${uiFallbacks}`);
  console.log(`Cache entries pruned: ${cacheEntriesPruned}`);

  return { assignmentDetails, updatedCache, stats: { metadataRowsScanned: assignmentLinks.length, cacheHits, directRequests, directFailures, uiFallbacks, cacheEntriesPruned } };
}

function organizeByClass(assignments, classes) {
  const byClass = {};

  // Initialize with class info
  classes.forEach(classInfo => {
    byClass[classInfo.className] = {
      className: classInfo.className,
      teacher: classInfo.teacher,
      period: classInfo.period,
      currentGrade: classInfo.currentGrade,
      assignments: []
    };
  });

  // Add assignments to their respective classes
  // Group by classId first to handle cases where className lookup failed
  const byClassId = {};
  assignments.forEach(assignment => {
    const classIdKey = assignment.classId;
    if (!byClassId[classIdKey]) {
      byClassId[classIdKey] = [];
    }
    byClassId[classIdKey].push(assignment);
  });

  // Now organize each classId group
  Object.entries(byClassId).forEach(([classId, assignmentGroup]) => {
    // Use the first assignment's class info as representative
    const rep = assignmentGroup[0];
    const className = rep.className || classId;

    if (!byClass[className]) {
      byClass[className] = {
        className,
        teacher: rep.teacher || '',
        period: rep.period || '',
        currentGrade: rep.currentGrade ?? null,
        assignments: []
      };
    }

    assignmentGroup.forEach(assignment => {
      byClass[className].assignments.push({
        name: assignment.assignmentName,
        dueDate: assignment.dateDue || assignment.dueDate || null,
        earnedPoints: assignment.earnedPoints,
        totalPoints: assignment.totalPoints,
        weight: assignment.weight,
        graded: assignment.graded
      });
    });
  });

  return Object.values(byClass).filter(entry => entry.assignments.length > 0);
}

async function scrapeMissingAssignments(page, currentQuarter = null) {
  console.log(`\nChecking for missing assignments${currentQuarter ? ` (${currentQuarter} only)` : ''}...`);
  let missingAssignments = [];

  try {
    const missingButton = await page.locator('#missingAssignments');
    if (await missingButton.isVisible({ timeout: 5000 })) {
      await missingButton.click();
      await page.waitForTimeout(2000);

      const noMissingText = await page.locator('text=No Missing Assignments!').count();
      if (noMissingText > 0) {
        console.log('No missing assignments found');
      } else {
        missingAssignments = await page.evaluate((quarter) => {
          const assignments = [];
          const seen = new Set();
          const rows = document.querySelectorAll('table tr');

          rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 4) return;

            const rawDate = cells[0]?.textContent.trim() || '';
          const dueQuarter = rawDate.match(/\(Q([1-4])\)/i)?.[1] || null;
          if (quarter && dueQuarter && dueQuarter !== quarter.slice(1)) return;

            const assignmentName = cells[1]?.textContent.trim() || '';
            const className = cells[2]?.textContent.trim() || '';
            const teacher = cells[3]?.textContent.trim() || '';
            const category = cells.length >= 5 ? cells[4]?.textContent.trim() || '' : '';
            const maxPoints = cells.length >= 6 ? cells[5]?.textContent.trim() || '' : '';
            const absent = cells.length >= 7 ? cells[6]?.textContent.trim() || '' : '';

            if (!rawDate || !assignmentName || !className) return;
            if (rawDate.toLowerCase().includes('due') || rawDate.toLowerCase().includes('gavin')) return;
            if (assignmentName.toLowerCase().includes('due') || assignmentName.toLowerCase().includes('gavin')) return;
            if (!rawDate.match(/\d+\/\d+\/\d+/) && !rawDate.includes('Q')) return;

            const normalizedDate = rawDate
              .replace(/\u00a0/g, ' ')
              .replace(/\s*\(Q\d+\)/i, '')
              .trim();

            const uniqueKey = `${normalizedDate}|${className}|${assignmentName}`;
            if (!seen.has(uniqueKey)) {
              seen.add(uniqueKey);
              const assignment = {
                due_date: normalizedDate,
                assignment_name: assignmentName,
                class_name: className,
                teacher: teacher
              };
              if (category) assignment.category = category;
              if (maxPoints) assignment.max_points = maxPoints;
              if (absent) assignment.absent = absent;
              assignments.push(assignment);
            }
          });

          return assignments;
        }, currentQuarter);
        console.log(`Found ${missingAssignments.length} missing assignments${currentQuarter ? ` (${currentQuarter})` : ''}`);
      }
    } else {
      console.log('Missing assignments button not found');
    }
  } catch (error) {
    console.log('Error checking missing assignments:', error.message);
  }

  return missingAssignments;
}

async function saveGradesToFile(grades, missingAssignments = []) {
  const gradesOutputPath = path.join(__dirname, '../src/data/grades.json');
  const missingOutputPath = path.join(__dirname, '../src/data/missing_assignments.json');

  let existingData = {
    metadata: {},
    classes: [],
    grade_history: {},
    overall_average: 0,
    average_history: {}
  };

  try {
    const existingContent = await fs.readFile(gradesOutputPath, 'utf-8');
    existingData = JSON.parse(existingContent);
  } catch (error) {
    console.log('No existing grades.json found, creating new file...');
  }

  const now = new Date();
  const dateKey = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
  const timestamp = now.toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York'
  });

  const toTitleCase = (str) => {
    return str
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
      .trim()
      .replace(/\s+/g, ' ');
  };

  const letter = (n) => {
    if (n === null || n === undefined) return null;
    if (n >= 90) return 'A';
    if (n >= 80) return 'B';
    if (n >= 70) return 'C';
    if (n >= 60) return 'D';
    return 'F';
  };

  const transformedClasses = grades.map(cls => ({
    class_name: toTitleCase(cls.class_name),
    teacher: cls.teacher,
    period: cls.period,
    q1_grade: cls.q1_grade ?? null,
    q1_letter_grade: cls.q1_grade !== undefined ? letter(cls.q1_grade) : null,
    q2_grade: cls.q2_grade ?? null,
    q2_letter_grade: cls.q2_grade !== undefined ? letter(cls.q2_grade) : null,
    q3_grade: cls.q3_grade ?? null,
    q3_letter_grade: cls.q3_grade !== undefined ? letter(cls.q3_grade) : null,
    q4_grade: cls.q4_grade ?? null,
    q4_letter_grade: cls.q4_grade !== undefined ? letter(cls.q4_grade) : null,
    current_grade: cls.current_grade ?? (cls.q4_grade !== null && cls.q4_grade !== undefined
      ? cls.q4_grade
      : (cls.q3_grade !== null && cls.q3_grade !== undefined ? cls.q3_grade : (cls.q2_grade !== null && cls.q2_grade !== undefined ? cls.q2_grade : cls.q1_grade))),
    letter_grade: cls.current_grade !== null && cls.current_grade !== undefined
      ? letter(cls.current_grade)
      : (cls.q4_grade !== null && cls.q4_grade !== undefined
        ? letter(cls.q4_grade)
        : (cls.q3_grade !== null && cls.q3_grade !== undefined ? letter(cls.q3_grade) : (cls.q2_grade !== null && cls.q2_grade !== undefined ? letter(cls.q2_grade) : letter(cls.q1_grade))))
  }));

  const gradeHistory = existingData.grade_history || {};
  transformedClasses.forEach(cls => {
    if (!gradeHistory[cls.class_name]) {
      gradeHistory[cls.class_name] = {};
    }
    gradeHistory[cls.class_name][dateKey] = cls.current_grade;
  });

  const validGrades = transformedClasses
    .map(c => c.current_grade)
    .filter(g => g !== null && g > 0);
  const overallAverage = validGrades.length > 0
    ? Math.round(validGrades.reduce((a, b) => a + b, 0) / validGrades.length)
    : 0;

  const averageHistory = existingData.average_history || {};
  averageHistory[dateKey] = overallAverage;

  const streakHistory = existingData.streak_history || {};
  const hasMissingAssignments = missingAssignments.length > 0;
  const allDates = Object.keys(averageHistory).sort((a, b) => {
    return new Date(a) - new Date(b);
  });

  let currentStreak = 0;
  for (let i = allDates.length - 1; i >= 0; i--) {
    const date = allDates[i];
    const missingStat = streakHistory[date];

    if (date === dateKey) {
      streakHistory[date] = hasMissingAssignments ? 0 : (i > 0 && streakHistory[allDates[i-1]] !== undefined ? streakHistory[allDates[i-1]] + 1 : 1);
      if (!hasMissingAssignments) {
        currentStreak = streakHistory[date];
      }
      break;
    }

    if (missingStat === undefined || missingStat === 0) {
      break;
    }
    currentStreak = missingStat;
  }

  if (hasMissingAssignments) {
    currentStreak = 0;
    streakHistory[dateKey] = 0;
  } else if (streakHistory[dateKey] === undefined) {
    const previousDate = allDates[allDates.indexOf(dateKey) - 1];
    const previousStreak = previousDate && streakHistory[previousDate] !== undefined ? streakHistory[previousDate] : 0;
    currentStreak = previousStreak === 0 ? 1 : previousStreak + 1;
    streakHistory[dateKey] = currentStreak;
  }

  const gradesOutputData = {
    metadata: {
      last_updated: timestamp,
      most_recent_date: dateKey,
      total_classes: transformedClasses.length
    },
    classes: transformedClasses,
    grade_history: gradeHistory,
    overall_average: overallAverage,
    average_history: averageHistory,
    streak: currentStreak,
    streak_history: streakHistory
  };

  const missingAssignmentsData = {
    metadata: {
      last_updated: timestamp,
      count: missingAssignments.length
    },
    missing_assignments: missingAssignments
  };

  await fs.writeFile(gradesOutputPath, JSON.stringify(gradesOutputData, null, 2));
  await fs.writeFile(missingOutputPath, JSON.stringify(missingAssignmentsData, null, 2));
  console.log(`Grades saved to ${gradesOutputPath} and missing assignments saved to ${missingOutputPath}`);
}

async function main() {
  let browser;
  let popup;
  const scrapeStartedAt = Date.now();
  const cache = await loadCache();

  try {
    // Login and navigate
    const result = await loginAndNavigateToGradebook();
    browser = result.browser;
    popup = result.popup;

    // Expand all classes to show assignments and paginate within each class
    await expandAllClasses(popup);
    await expandAllAssignments(popup);

    // Get class information
    const { classes, classIdMap, currentQuarter } = await getClassInfo(popup);
    console.log(`\nFound ${classes.length} classes`);
    console.log('Classes:', classes.map(c => `Period ${c.period}: ${c.className} (groupId: ${c.groupId})`).join(', '));
    console.log('ClassIdMap keys:', Object.keys(classIdMap).join(', '));

    // Scrape all assignment details
    const { assignmentDetails, updatedCache } = await scrapeAllAssignments(
      popup,
      classes,
      cache.assignments,
      classIdMap,
      currentQuarter
    );
    console.log(`\nSuccessfully extracted ${assignmentDetails.length} assignments`);

    const missingAssignments = await scrapeMissingAssignments(popup, currentQuarter);

    // Persist grades.json using the quarter detected from Skyward's highlight.
    const gradeClasses = classes.map(c => ({
      class_name: c.className,
      teacher: c.teacher,
      period: c.period,
      q1_grade: c.q1_grade ?? null,
      q2_grade: c.q2_grade ?? null,
      q3_grade: c.q3_grade ?? null,
      q4_grade: c.q4_grade ?? null,
      current_grade: c.currentGrade ?? null
    }));
    await saveGradesToFile(gradeClasses, missingAssignments);

    // Organize data by class
    const dataByClass = organizeByClass(assignmentDetails, classes);

    // Save to file
    const outputPath = path.join(__dirname, 'detailed-grades.json');
    const outputData = {
      metadata: {
        scrapedAt: new Date().toISOString(),
        totalClasses: classes.length,
        totalAssignments: assignmentDetails.length
      },
      classes: dataByClass
    };

    const previousOutput = await readJsonIfExists(outputPath);
    const comparableOutput = { ...outputData, metadata: { ...outputData.metadata, scrapedAt: null } };
    const previousComparableOutput = previousOutput
      ? { ...previousOutput, metadata: { ...previousOutput.metadata, scrapedAt: null } }
      : null;
    const outputChanged = await saveJsonIfChanged(outputPath, outputData, previousComparableOutput && JSON.stringify(previousComparableOutput) === JSON.stringify(comparableOutput) ? previousOutput : comparableOutput);
    console.log(`\n${outputChanged ? '✓ Data saved' : '· Data unchanged'}: ${outputPath}`);

    const progress = await updatePointsProgress({
      classes: gradeClasses,
      scrapedClasses: dataByClass,
      missingAssignments,
    });
    console.log(`${progress.changed ? '✓ Quest progress updated' : '· Quest progress unchanged'}: raw ${progress.rawTotal}, protected ${progress.protectedTotal}`);

    // Also save raw assignments for debugging
    const rawOutputPath = path.join(__dirname, 'detailed-grades-raw.json');
    const rawChanged = await saveJsonIfChanged(rawOutputPath, assignmentDetails);
    console.log(`${rawChanged ? '✓ Raw data saved' : '· Raw data unchanged'}: ${rawOutputPath}`);

    // Persist cache for future runs
    const cacheChanged = await saveCache(cache.path, updatedCache);
    console.log(`${cacheChanged ? 'Cache updated' : 'Cache unchanged'} at: ${cache.path}`);

    await browser.close();
    console.log(`Total scrape duration: ${Date.now() - scrapeStartedAt}ms`);
    console.log('\n✓ Scraping complete!');

  } catch (error) {
    console.error('\n✗ Error during scraping:', error);

    if (popup && error.code !== 'UNRESOLVED_ASSIGNMENT_DETAILS') {
      try {
        await popup.screenshot({
          path: path.join(__dirname, 'enhanced-scraper-error.png'),
          fullPage: true
        });
        console.log('Error screenshot saved');
      } catch (e) {
        // Ignore screenshot errors
      }
    }

    if (browser) {
      await browser.close();
    }

    process.exit(1);
  }
}

module.exports = {
  parseAssignmentDetails,
  fetchAssignmentDetails,
  mapWithConcurrency,
  extractAssignmentDetails,
  getAssignmentScoreHint,
  scrapeMissingAssignments,
  assignmentCacheKey,
  assignmentFingerprint,
  canUseCachedAssignment,
  scrapeAllAssignments
};

if (require.main === module) {
  main();
}
