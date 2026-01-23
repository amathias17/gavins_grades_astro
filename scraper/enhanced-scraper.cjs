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

  await fs.writeFile(cachePath, JSON.stringify(payload, null, 2));
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

      // Get current grade from the grade row (Q3 column)
      const gradeRow = document.querySelector(`tr[group-parent="${groupId}"]`);
      let currentGrade = null;
      let q3Grade = null;
      let isHighlighted = false;

      if (gradeRow) {
        isHighlighted = gradeRow.querySelector('.sf_highlightYellow') !== null;
        const gradeCells = gradeRow.querySelectorAll('td');
        const q3Link = gradeCells[2]?.querySelector('a[id="showGradeInfo"]');

        if (q3Link) {
          const gradeText = q3Link.textContent?.trim().replace(/%/g, '');
          const grade = Number(gradeText);
          if (Number.isFinite(grade) && grade >= 0 && grade <= 100) {
            q3Grade = grade;
            currentGrade = grade;
          }
        }

        // Highlighted but no Q3 value present: treat as 0 until posted
        if (isHighlighted && q3Grade === null) {
          q3Grade = 0;
          currentGrade = 0;
        }
      }

      if (isHighlighted) {
        const entry = {
          className,
          teacher,
          period,
          groupId,
          currentGrade,
          q3_grade: q3Grade
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

    return { classes, classIdMap };
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
      const classId = link.getAttribute('data-gid');
      const studentId = link.getAttribute('data-sid');
      const name = link.textContent.trim();

      // Get due date from the row
      const dueSpan = row.querySelector('span.fXs');
      const dueDate = dueSpan ? dueSpan.textContent.trim() : null;

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
        classId,
        studentId,
        name,
        dueDate,
        classNameHint: classNameFromDOM,
        periodHint: periodFromDOM,
        teacherHint: teacherFromDOM,
        groupIdHint
      });
    });

    return assignments;
  });
}

async function extractAssignmentDetails(page, assignmentId, classId) {
  try {
    // Click the assignment link with matching data attributes
    const selector = `a#showAssignmentInfo[data-aid="${assignmentId}"][data-gid="${classId}"]`;
    const link = page.locator(selector).first();

    // Wait for the link to be visible and click it
    await link.waitFor({ state: 'visible', timeout: 5000 });
    await link.click();

    // Wait for the detail modal/popup to appear
    const dialogLocator = page.locator('.sf_Dialog, .ui-dialog, [role="dialog"]').first();
    await dialogLocator.waitFor({ state: 'visible', timeout: 5000 });

    // Extract the assignment details from the modal
    const details = await page.evaluate(() => {
      const dialog = document.querySelector('.sf_Dialog, .ui-dialog, [role="dialog"]');
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

      // Fallback: derive earned from percentage when points aren't parsed
      if (!graded && totalPoints !== null && Number.isFinite(percentValue)) {
        earnedPoints = Math.round((percentValue / 100) * totalPoints * 100) / 100;
        graded = true;
      }

      // If points parsed as 0 but percentage indicates credit, recompute from percent
      if (
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

    // Close the modal (try various close methods)
    try {
      // Look for close button
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
        try {
          await page.click(selector, { timeout: 1000 });
          break;
        } catch (e) {
          // Try next selector
        }
      }

      // If no close button found, press Escape
      await page.keyboard.press('Escape');
    } catch (e) {
      // Modal might have auto-closed
    }

    try {
      const dialogLocator = page.locator('.sf_Dialog, .ui-dialog, [role="dialog"]').first();
      await dialogLocator.waitFor({ state: 'hidden', timeout: 2000 });
    } catch (e) {
      await page.waitForTimeout(200);
    }

    return details;

  } catch (error) {
    console.error(`Error extracting details for assignment ${assignmentId}:`, error.message);
    return {
      graded: false,
      earnedPoints: 0,
      totalPoints: null,
      weight: null,
      dateDue: null,
      hasStar: false
    };
  }
}

async function scrapeAllAssignments(page, classes, cacheAssignments = {}, classIdMap = {}) {
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

  // Process each assignment
  for (let i = 0; i < assignmentLimit; i++) {
    const assignment = assignmentLinks[i];

    if (i < 5) {
      console.log(`DEBUG: Index ${i}, assignment from array:`, JSON.stringify({name: assignment.name, classId: assignment.classId, assignmentId: assignment.assignmentId}));
    }

    // Only keep Q3 (due date text typically contains (Q3))
    if (!assignment.dueDate || !/\(Q3\)/i.test(assignment.dueDate)) {
      continue;
    }

    if (i < 10 || i % 50 === 0) {
      console.log(`Processing ${i + 1}/${assignmentLinks.length}: ${assignment.name} (classId=${assignment.classId})`);
    } else {
      console.log(`Processing ${i + 1}/${assignmentLinks.length}: ${assignment.name}`);
    }

    const cacheKeyParts = [assignment.assignmentId, assignment.classId, assignment.studentId].filter(Boolean);
    const cacheKey = cacheKeyParts.join(':');
    const cached = cacheKey ? cacheAssignments[cacheKey] : null;

    let details = cached && cached.graded ? cached : null;
    if (details) {
      cacheHits += 1;
    } else {
      // Extract detailed points by clicking the assignment
      details = await extractAssignmentDetails(page, assignment.assignmentId, assignment.classId);
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

    if (graded && cacheKey) {
      updatedCache[cacheKey] = {
        ...assignmentData,
        graded: true,
        cachedAt: new Date().toISOString()
      };
    } else if (cacheKey && updatedCache[cacheKey]) {
      // Keep pending items uncached so they are refreshed when grades land
      delete updatedCache[cacheKey];
    }

    assignmentDetails.push(assignmentData);
  }

  console.log(`Cache hits: ${cacheHits}`);

  return { assignmentDetails, updatedCache };
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

async function scrapeMissingAssignments(page) {
  console.log('\nChecking for missing assignments (Q3 only)...');
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
        missingAssignments = await page.evaluate(() => {
          const assignments = [];
          const seen = new Set();
          const rows = document.querySelectorAll('table tr');

          rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 4) return;

            const rawDate = cells[0]?.textContent.trim() || '';
            if (!rawDate.toLowerCase().includes('q3')) return;

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
        });
        console.log(`Found ${missingAssignments.length} missing assignments (Q3)`);
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
    current_grade: cls.q3_grade !== null && cls.q3_grade !== undefined
      ? cls.q3_grade
      : (cls.q2_grade !== null && cls.q2_grade !== undefined ? cls.q2_grade : cls.q1_grade),
    letter_grade: cls.q3_grade !== null && cls.q3_grade !== undefined
      ? letter(cls.q3_grade)
      : (cls.q2_grade !== null && cls.q2_grade !== undefined ? letter(cls.q2_grade) : letter(cls.q1_grade))
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
    const { classes, classIdMap } = await getClassInfo(popup);
    console.log(`\nFound ${classes.length} classes`);
    console.log('Classes:', classes.map(c => `Period ${c.period}: ${c.className} (groupId: ${c.groupId})`).join(', '));
    console.log('ClassIdMap keys:', Object.keys(classIdMap).join(', '));

    // Scrape all assignment details
    const { assignmentDetails, updatedCache } = await scrapeAllAssignments(
      popup,
      classes,
      cache.assignments,
      classIdMap
    );
    console.log(`\nSuccessfully extracted ${assignmentDetails.length} assignments`);

    // Missing assignments (Q3 only)
    const missingAssignments = await scrapeMissingAssignments(popup);

    // Persist grades.json using Q3-only classes
    const gradeClasses = classes.map(c => ({
      class_name: c.className,
      teacher: c.teacher,
      period: c.period,
      q1_grade: null,
      q2_grade: null,
      q3_grade: c.q3_grade ?? null
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

    await fs.writeFile(outputPath, JSON.stringify(outputData, null, 2));
    console.log(`\n✓ Data saved to: ${outputPath}`);

    // Also save raw assignments for debugging
    const rawOutputPath = path.join(__dirname, 'detailed-grades-raw.json');
    await fs.writeFile(rawOutputPath, JSON.stringify(assignmentDetails, null, 2));
    console.log(`✓ Raw data saved to: ${rawOutputPath}`);

    // Persist cache for future runs
    await saveCache(cache.path, updatedCache);
    console.log(`Cache updated at: ${cache.path}`);

    await browser.close();
    console.log('\n✓ Scraping complete!');

  } catch (error) {
    console.error('\n✗ Error during scraping:', error);

    if (popup) {
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

main();
